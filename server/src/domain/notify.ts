/**
 * Telling someone a price fell.
 *
 * Until now the app recorded drops and told nobody, so the only way to learn
 * that a fare had fallen was to open the page and look — which is most of the
 * value of a tracker missing. This is that gap closed.
 *
 * Web Push rather than email, for one reason: it needs no account anywhere. No
 * provider to sign up for, no sending domain to verify, no API key belonging to
 * a third party. The keys are ours, and the message goes to the phone.
 *
 * What is deliberately *not* sent: every check. A notification that arrives when
 * nothing happened teaches the reader to swipe it away unread, and then the one
 * that matters is swiped away too.
 */
import webpush, { WebPushError } from 'web-push';
import { db } from './db.js';

/**
 * Why someone is being interrupted.
 *
 * Ranked, and the order is the point. `rebook` is money already spent coming
 * back and is the only one with a deadline attached, so it outranks everything.
 * `target` is a number the reader chose themselves, so it beats a drop they
 * never asked about. `drop` is news.
 */
export type AlertKind = 'rebook' | 'target' | 'drop';

export interface Alert {
  kind: AlertKind;
  vacationId: string;
  vacationName: string;
  optionId: string;
  title: string;
  currency: string;
  /** Where the price came from: the previous check, or what was paid. */
  from: number;
  to: number;
  /** The number the reader set, on a `target` alert. */
  target?: number;
  /** Whether the booking can still be cancelled free, on a `rebook` alert. */
  freeCancellation?: boolean;
}

/** Kept for the sweep's own summary, which counts plain drops. */
export type Drop = Alert;

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function pushConfig(): PushConfig | null {
  const publicKey = process.env['VAPID_PUBLIC_KEY']?.trim();
  const privateKey = process.env['VAPID_PRIVATE_KEY']?.trim();
  if (!publicKey || !privateKey) return null;
  // The subject identifies us to the push service; a mailto is what the spec
  // expects, and the push services reject some other forms.
  const subject = process.env['VAPID_SUBJECT']?.trim() || 'mailto:noreply@mehiron.app';
  return { publicKey, privateKey, subject };
}

/**
 * The message for everything one sweep found.
 *
 * One notification for the sweep rather than one per finding. Three hotels
 * falling at once is a single useful event, and three buzzes for it is how
 * someone learns to swipe these away unread — after which the one that mattered
 * gets swiped away too.
 *
 * The headline goes to the most actionable finding, not the largest number: a
 * ₪200 rebooking that expires when free cancellation does beats a ₪900 drop on
 * something nobody has booked.
 */
const RANK: Record<AlertKind, number> = { rebook: 0, target: 1, drop: 2 };

const shekels = (n: number): string => `${Math.round(n).toLocaleString('he-IL')} ₪`;

function headlineOf(alert: Alert): string {
  const saving = Math.round(alert.from - alert.to);
  if (alert.kind === 'rebook') return `💸 ${shekels(saving)} בחזרה — ${alert.title}`;
  if (alert.kind === 'target') return `🎯 ${alert.title} הגיע ל-${shekels(alert.to)}`;
  return `↓ ${shekels(saving)} — ${alert.title}`;
}

function detailOf(alert: Alert): string {
  if (alert.kind === 'rebook') {
    const terms = alert.freeCancellation
      ? 'הביטול עדיין חינם — אפשר להזמין מחדש ולבטל'
      : 'כדאי לבדוק את תנאי הכרטיס לפני שמזמינים מחדש';
    return `${alert.vacationName}: שילמת ${shekels(alert.from)}, עכשיו ${shekels(alert.to)}. ${terms}.`;
  }
  if (alert.kind === 'target') {
    return `${alert.vacationName}: היעד שהגדרת היה ${shekels(alert.target ?? alert.to)}.`;
  }
  return `${alert.vacationName}: ${shekels(alert.from)} → ${shekels(alert.to)}`;
}

export function composeMessage(alerts: readonly Alert[]): { title: string; body: string; url: string } | null {
  if (alerts.length === 0) return null;

  // Most actionable kind first, and within a kind the largest saving.
  const ordered = [...alerts].sort(
    (a, b) => RANK[a.kind] - RANK[b.kind] || (b.from - b.to) - (a.from - a.to),
  );
  const lead = ordered[0] as Alert;

  const oneVacation = new Set(alerts.map((a) => a.vacationId)).size === 1;
  const url = oneVacation ? `/vacations/${lead.vacationId}` : '/';

  if (alerts.length === 1) {
    return { title: headlineOf(lead), body: detailOf(lead), url };
  }

  const others = alerts.length - 1;
  return {
    title: headlineOf(lead),
    body: `${detailOf(lead)} ועוד ${others === 1 ? 'עדכון אחד' : `${others} עדכונים`}.`,
    url,
  };
}

/** True for the statuses that mean this subscription is gone for good. */
export function isGone(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Send one notification to every subscribed browser.
 *
 * Returns how many were reached. Failures are not thrown: a check that priced
 * everything correctly has succeeded even if a phone could not be reached, and
 * throwing here would turn a delivery problem into a lost price.
 */
export async function notifyDrops(alerts: readonly Alert[]): Promise<{ sent: number; pruned: number }> {
  const message = composeMessage(alerts);
  const config = pushConfig();
  if (!message || !config) return { sent: 0, pruned: 0 };

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const subscriptions = await db.pushSubscription.findMany();
  const payload = JSON.stringify(message);

  let sent = 0;
  let pruned = 0;

  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
      sent += 1;
      await db.pushSubscription.update({
        where: { id: row.id },
        data: { lastSentAt: new Date(), failures: 0 },
      });
    } catch (error) {
      const status = error instanceof WebPushError ? error.statusCode : 0;
      if (isGone(status)) {
        // The browser is gone. Keeping the row would mean failing forever.
        await db.pushSubscription.delete({ where: { id: row.id } }).catch(() => undefined);
        pruned += 1;
      } else {
        /*
         * Anything else may be a transient outage, so the subscription survives
         * — but not indefinitely. Five consecutive non-fatal failures is a dead
         * endpoint that simply is not saying so.
         */
        const failures = row.failures + 1;
        if (failures >= 5) {
          await db.pushSubscription.delete({ where: { id: row.id } }).catch(() => undefined);
          pruned += 1;
        } else {
          await db.pushSubscription.update({ where: { id: row.id }, data: { failures } }).catch(() => undefined);
        }
      }
    }
  }

  return { sent, pruned };
}

export async function saveSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    },
    // Re-subscribing is how a browser recovers, so this clears the failure count.
    update: { p256dh: input.p256dh, auth: input.auth, failures: 0 },
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function subscriptionCount(): Promise<number> {
  return db.pushSubscription.count();
}
