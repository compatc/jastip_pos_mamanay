import { precacheAndRoute } from "workbox-precaching";

declare const self: any;

precacheAndRoute(self.__WB_MANIFEST);

const NOTIF_URL = "/orders";

self.addEventListener("push", (event: any) => {
  let title = "QRIS Lunas";
  let body = "";
  let tag = "qris-payment";
  let url = NOTIF_URL;
  try {
    const data = event.data ? event.data.json() : {};
    title = data.title || title;
    body = data.body || "";
    tag = data.tag || tag;
    url = data.url || url;
  } catch {
    // payload bukan JSON, pakai nilai bawaan
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo.png",
      badge: "/logo.png",
      tag,
      vibrate: [200, 100, 200],
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const url = event.notification.data?.url || NOTIF_URL;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("navigate" in client) {
          await client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
