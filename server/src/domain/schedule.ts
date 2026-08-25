/**
 * Deciding which vacations are due a check, and checking them.
 *
 * The app stores an interval per vacation, but nothing was ever running it —
 * prices only moved when someone pressed בדיקה עכשיו. This is the piece that
 * closes that gap. It is deliberately *pull*-shaped: an outside scheduler asks
 * "what is due?" as often as it likes, and this decides. That keeps the app
 * hostable anywhere a URL can be hit on a timer, with no process to keep alive.
 *
 * The consequence worth knowing: a sweep is only as frequent as whatever calls
 * it. A 15-minute interval on a scheduler that fires daily is checked daily.
 * `runDueChecks` reports what it deferred so that gap is visible rather than
 * silent.
 */
import { db } from './db.js';
import { checkVacation, type CheckOutcome } from './check.js';
import { listVacations, type VacationWithOptions } from './vacations.js';
import { notifyDrops, type Alert } from './notify.js';

/** The minimum a vacation needs for the question "is it due?" to be answerable. */
export interface Schedulable {
  intervalSeconds: number;
  paused: boolean;
  archived: boolean;
  lastCheckedAt: Date | null;
  options: ReadonlyArray<{ active: boolean }>;
}

/**
 * How early a check may run.
 *
 * A scheduler firing on the hour and an interval of an hour miss each other
 * forever: the check at 12:00:04 leaves 59m56s elapsed at 13:00:00, which is
 * not yet an hour, so it waits for 14:00 and an hourly interval becomes a
 * two-hourly one. Allowing a check slightly early removes the whole class of
 * drift. A tenth of the interval, never more than a minute, is small enough
 * that it cannot meaningfully increase how often Google is asked.
 */
export function graceMs(intervalSeconds: number): number {
  return Math.min(60_000, Math.round(intervalSeconds * 100));
}

export function isDue(vacation: Schedulable, now: Date): boolean {
  if (vacation.archived || vacation.paused) return false;

  // Nothing is being watched, so a check would spend a Google request to learn
  // nothing. Creating a vacation and not picking anything is the common case here.
  if (!vacation.options.some((o) => o.active)) return false;

  if (vacation.lastCheckedAt === null) return true;

  const elapsed = now.getTime() - vacation.lastCheckedAt.getTime();
  return elapsed >= vacation.intervalSeconds * 1_000 - graceMs(vacation.intervalSeconds);
}

/** When this vacation next becomes due, or null if it never will as it stands. */
export function nextDueAt(vacation: Schedulable): Date | null {
  if (vacation.archived || vacation.paused) return null;
  if (!vacation.options.some((o) => o.active)) return null;
  if (vacation.lastCheckedAt === null) return new Date(0);
  return new Date(
    vacation.lastCheckedAt.getTime() + vacation.intervalSeconds * 1_000 - graceMs(vacation.intervalSeconds),
  );
}

export interface SweepEntry {
  vacationId: string;
  name: string;
  outcome: CheckOutcome | null;
  error: string | null;
  /** Wall-clock cost, which is what the time budget is spent in. */
  tookMs: number;
}

export interface Sweep {
  startedAt: string;
  tookMs: number;
  /** How many were due when the sweep began. */
  due: number;
  ran: SweepEntry[];
  /** Due but not reached before the budget ran out — named, so it is not silent. */
  deferred: Array<{ vacationId: string; name: string }>;
  /** Price falls found anywhere in the sweep, the reason to read the result. */
  drops: Alert[];
  /** Targets reached and rebooking opportunities, the alerts worth acting on. */
  alerts: Alert[];
  /** Browsers reached, and dead subscriptions removed. */
  notified: { sent: number; pruned: number };
}

export interface SweepOptions {
  now?: Date;
  /**
   * Stop *starting* new vacations once this much time has gone. A check already
   * under way is never abandoned — its snapshots are half-written at that point.
   * Default 45s, under Vercel's 60s Hobby function ceiling with room for the
   * last check to finish and the response to be sent.
   */
  budgetMs?: number;
  /** Hard cap on how many vacations one sweep will check. */
  max?: number;
}

/**
 * Check everything that is due, oldest first.
 *
 * Oldest-first is what makes a budget-limited sweep fair: whatever was skipped
 * for time is by definition the least recently checked, so it leads the next
 * sweep. Checking in any other order can starve one vacation indefinitely.
 *
 * A failing vacation does not stop the sweep — it is recorded and the next one
 * runs. `checkVacation` already writes failures down as snapshots, so a
 * consistently unreachable hotel shows up as history rather than as silence.
 */
export async function runDueChecks(options: SweepOptions = {}): Promise<Sweep> {
  const now = options.now ?? new Date();
  const budgetMs = options.budgetMs ?? 45_000;
  const startedAt = now;
  const began = Date.now();

  const all = await listVacations();
  const due = all
    .filter((v) => isDue(v, now))
    .sort((a, b) => (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0))
    .slice(0, options.max ?? Number.MAX_SAFE_INTEGER);

  const sweep: Sweep = {
    startedAt: startedAt.toISOString(),
    tookMs: 0,
    due: due.length,
    ran: [],
    deferred: [],
    drops: [],
    alerts: [],
    notified: { sent: 0, pruned: 0 },
  };

  for (const vacation of due) {
    if (Date.now() - began >= budgetMs) {
      sweep.deferred.push({ vacationId: vacation.id, name: vacation.name });
      continue;
    }

    const one = Date.now();
    try {
      const outcome = await checkVacation(vacation satisfies VacationWithOptions);
      sweep.ran.push({
        vacationId: vacation.id,
        name: vacation.name,
        outcome,
        error: null,
        tookMs: Date.now() - one,
      });
      const where = {
        vacationId: vacation.id,
        vacationName: vacation.name,
        currency: vacation.currency,
      };
      for (const d of outcome.drops) sweep.drops.push({ kind: 'drop', ...where, ...d });
      for (const t of outcome.targets) {
        sweep.alerts.push({ kind: 'target', ...where, ...t, from: t.target });
      }
      for (const r of outcome.rebookings) sweep.alerts.push({ kind: 'rebook', ...where, ...r });
    } catch (error) {
      /*
       * The stamp matters on failure too. Without it a vacation that throws
       * every time stays permanently due and every sweep spends its whole
       * budget on it, starving the others — the starvation this ordering exists
       * to prevent.
       */
      await db.vacation
        .update({ where: { id: vacation.id }, data: { lastCheckedAt: new Date() } })
        .catch(() => undefined);

      sweep.ran.push({
        vacationId: vacation.id,
        name: vacation.name,
        outcome: null,
        error: error instanceof Error ? error.message : 'הבדיקה נכשלה',
        tookMs: Date.now() - one,
      });
    }
  }

  /*
   * One notification for the whole sweep, sent after everything is priced.
   * Notifying per vacation would buzz three times for one useful event, which
   * is how someone learns to swipe these away unread.
   *
   * A delivery failure must not fail the sweep: the prices are already written
   * down, and losing them over an unreachable phone would be the wrong trade.
   */
  /*
   * Drops and the actionable alerts go out together, so a target reached and the
   * drop that reached it are one notification rather than two. A drop that also
   * produced a rebooking or a target is dropped from the plain list — the
   * stronger alert already says the price fell, and saying it twice in one
   * message reads like a bug.
   */
  const louder = new Set(sweep.alerts.map((a) => a.optionId));
  const everything = [...sweep.alerts, ...sweep.drops.filter((d) => !louder.has(d.optionId))];
  if (everything.length > 0) {
    sweep.notified = await notifyDrops(everything).catch(() => ({ sent: 0, pruned: 0 }));
  }

  sweep.tookMs = Date.now() - began;
  return sweep;
}
