/**
 * Telling "Google returned no results" apart from "Google returned no results
 * *yet*".
 *
 * Google serves these pages two ways for the same request. Usually the fares
 * and rates are inlined in the HTML, which is the whole basis of this app. But
 * sometimes it returns the page shell with the results left to client-side
 * rendering, and that shell is a normal HTTP 200 of nearly the same size — it
 * simply has no prices in it. Measured on one unchanged flight search: rendered,
 * rendered, shell, shell, at twenty-second intervals.
 *
 * Reading a shell as "no flights" would be a lie recorded as history, and
 * reading it as "the parser broke" sends whoever looks at it hunting a bug that
 * is not there. So it gets recognised for what it is, and retried.
 */

/** The label the shell carries where the results will go. */
const LOADING = ['התוצאות נטענות', 'Results are loading', 'Loading results'];

/**
 * True when the page is still a shell: it says results are loading and nothing
 * was parsed out of it.
 *
 * Both halves matter. The label alone is not enough — it survives in the markup
 * of some fully-rendered pages — and an empty parse alone is not enough either,
 * because a search genuinely can have no flights.
 */
export function isLoadingShell(html: string, parsedCount: number): boolean {
  if (parsedCount > 0) return false;
  return LOADING.some((label) => html.includes(label));
}

/**
 * Gaps between attempts, in milliseconds.
 *
 * Hammering does not work: eight requests at two-and-a-half second intervals
 * returned a shell every time, while the same search spaced out rendered on the
 * first attempt. So the gaps are wide enough to be worth taking, and few enough
 * to fit a serverless function's ceiling alongside the rest of a check.
 */
export const RETRY_GAPS_MS = [4_000, 9_000] as const;

/**
 * Extra page loads a whole check may spend on shells, shared across everything
 * it looks at.
 *
 * Without a shared ceiling the cost multiplies by however many hotels a vacation
 * watches: a first attempt at three retries each turned one sweep into 99
 * seconds, past the serverless ceiling, so vacations started being deferred for
 * time. Deferring a whole vacation to retry one hotel is a bad trade — the next
 * sweep is fifteen minutes away, not a day. Flights draw on the budget first,
 * because one flight page prices every flight option at once.
 */
export interface RetryBudget {
  extraLoads: number;
}

export function retryBudget(extraLoads = 2): RetryBudget {
  return { extraLoads };
}

export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch and parse, retrying only while the page is a shell.
 *
 * `attempts` is capped by how many gaps there are. A genuinely empty result is
 * returned immediately rather than retried — there is nothing to wait for.
 */
export async function readRendered<T>(
  fetchPage: () => Promise<string>,
  parse: (html: string) => T[],
  budget: RetryBudget,
  maxAttempts = RETRY_GAPS_MS.length + 1,
): Promise<{ items: T[]; attempts: number; shell: boolean }> {
  let attempts = 0;
  let items: T[] = [];
  let shell = false;

  for (;;) {
    if (attempts > 0) await pause(RETRY_GAPS_MS[attempts - 1] ?? 9_000);
    attempts += 1;

    const html = await fetchPage();
    items = parse(html);
    shell = isLoadingShell(html, items.length);
    if (!shell) return { items, attempts, shell: false };

    // Out of attempts for this page, or out of budget for the whole check.
    if (attempts >= maxAttempts || budget.extraLoads <= 0) break;
    budget.extraLoads -= 1;
  }

  return { items, attempts, shell };
}

/** What to record when every attempt came back a shell. */
export function shellNote(attempts: number): string {
  return `Google החזיר דף שהתוצאות בו עדיין נטענות, ב-${attempts} ניסיונות — לא באג אצלנו, והבדיקה הבאה בדרך כלל מצליחה`;
}
