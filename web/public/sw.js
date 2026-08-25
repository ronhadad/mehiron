/*
 * The service worker that shows a price-drop notification.
 *
 * It is deliberately tiny. A service worker persists across deploys and updates
 * on its own schedule, so anything clever in here is code that may still be
 * running a month after it was replaced. Everything decidable is decided on the
 * server and arrives in the payload.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let message;
  try {
    message = event.data.json();
  } catch {
    // Never show a raw payload: if it cannot be read there is nothing here
    // worth interrupting someone for.
    return;
  }

  event.waitUntil(
    self.registration.showNotification(message.title || 'מחירון', {
      body: message.body || '',
      dir: 'rtl',
      lang: 'he',
      // One tag, so a second drop replaces the first rather than stacking a
      // column of notifications nobody reads.
      tag: 'mehiron-drop',
      renotify: true,
      data: { url: message.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse a tab already open on the app rather than piling up a new one
      // every time a notification is tapped.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
