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

export interface Drop {
  vacationId: string;
  vacationName: string;
  optionId: string;
  title: string;
  from: number;
  to: number;
  currency: string;
}

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
 * The message for a set of drops.
 *
 * One notification for the whole sweep, not one per drop: three hotels falling
 * at once is one useful event, and three buzzes for it is an annoyance that gets
 * notifications turned off.
 */
export function composeMessage(drops: readonly Drop[]): { title: string; body: string; url: string } | null {
  if (drops.length === 0) return null;

  const biggest = [...drops].sort((a, b) => b.from - b.to - (a.from - a.to))[0] as Drop;
  const saving = Math.round(biggest.from - biggest.to);
  const money = (n: number): string => `${Math.round(n).toLocaleString('he-IL')} ₪`;

  if (drops.length === 1) {
    return {
      title: `↓ ${money(saving)} — ${biggest.title}`,
      body: `${biggest.vacationName}: ${money(biggest.from)} → ${money(biggest.to)}`,
      url: `/vacations/${biggest.vacationId}`,
    };
  }

  const total = drops.reduce((sum, d) => sum + (d.from - d.to), 0);
  return {
    title: `↓ ${drops.length} מחירים ירדו`,
    body: `הגדול ביותר: ${biggest.title}, ${money(saving)}. סה״כ ${money(total)} על ${drops.length} מעקבים.`,
    // More than one vacation may be involved, so the list is the honest target.
    url: new Set(drops.map((d) => d.vacationId)).size === 1 ? `/vacations/${biggest.vacationId}` : '/',
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
export async function notifyDrops(drops: readonly Drop[]): Promise<{ sent: number; pruned: number }> {
  const message = composeMessage(drops);
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
