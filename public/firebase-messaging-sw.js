/* Firebase Cloud Messaging service worker.
 *
 * Registered by src/lib/push.js with the public Firebase config in the query
 * string: a service worker cannot read the app's build-time environment, and
 * the values passed here are public web config — never a server key.
 *
 * Background messages are handled by the SDK; the notification payload is
 * already privacy-safe (no visitor message text), so it can be shown directly.
 */
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

try {
  const params = new URLSearchParams(self.location.search);
  const raw = params.get("config");
  const config = raw ? JSON.parse(decodeURIComponent(raw)) : null;
  if (config && config.projectId) {
    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const notification = payload.notification || {};
      const data = payload.data || {};
      const link = data.link || (payload.fcmOptions && payload.fcmOptions.link) || "/dashboard";
      self.registration.showNotification(notification.title || "SBD AI Solutions", {
        body: notification.body || "You have a new update.",
        icon: "/sbd-ai-solutions-icon.png",
        badge: "/sbd-ai-solutions-icon.png",
        tag: data.tag || "sbd",
        data: { link },
      });
    });
  }
} catch (error) {
  /* A malformed config must not break the worker for other features. */
  console.error("[sw] push setup failed", error);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/dashboard";
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
