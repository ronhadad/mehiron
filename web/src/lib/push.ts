/**
 * Turning browser notifications on, from the browser's side.
 *
 * The order of operations here is not optional. Permission must be requested
 * from a real user gesture — a click — or browsers refuse it outright and, worse,
 * some remember the refusal. So none of this runs on page load.
 */

/** Base64url, which is what the VAPID key arrives as, to the bytes the API wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const standard = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(standard);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.getRegistration();
  const existing = await registration?.pushManager.getSubscription();
  return existing ? 'on' : 'off';
}

/**
 * Ask permission, subscribe, and tell the server.
 *
 * Throws with something sayable rather than returning a bare false: every
 * failure here has a distinct cause, and "it didn't work" is not useful when the
 * cause is that permission was refused.
 */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('הדפדפן הזה לא תומך בהתראות');

  const { publicKey } = (await fetch('/api/push/subscribe').then((r) => {
    if (!r.ok) throw new Error('התראות לא מוגדרות בשרת');
    return r.json();
  })) as { publicKey: string };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('ההרשאה להתראות נדחתה');

  const registration = await navigator.serviceWorker.register('/sw.js');
  // A worker that is still installing cannot be subscribed against.
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    // Non-visible pushes are refused by browsers, and every push here shows a
    // notification anyway.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error('שמירת המנוי נכשלה');
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  // Tell the server first: unsubscribing locally and then failing to reach the
  // server would leave a row that can never be delivered to.
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe();
}
