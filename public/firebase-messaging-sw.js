/* SBD Solutions service worker.
 *
 * One worker serves both the installable app and Firebase Cloud Messaging:
 * two workers cannot share the "/" scope, so caching and push live together.
 *
 * Privacy rules:
 *  - Only public, static files are cached (icons, manifest, hashed assets,
 *    fonts). /api responses, authenticated HTML, payment pages and anything
 *    sent with no-store are never stored.
 *  - Navigations are network-first, so a signed-out browser never gets a
 *    cached signed-in dashboard. The only HTML kept is the offline page.
 *
 * Firebase values arrive in the query string when src/lib/push.js registers
 * the worker; they are public web config, never a server key.
 */
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

const CACHE_VERSION = "sbd-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/pwa-192.png",
  "/pwa-512.png",
  "/favicon-32.png",
  "/brand/sbd-solutions-mark.png",
];

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
      self.registration.showNotification(notification.title || "SBD Solutions", {
        body: notification.body || "You have a new update.",
        icon: "/pwa-192.png",
        badge: "/favicon-64.png",
        tag: data.tag || "sbd",
        data: { link },
      });
    });
  }
} catch (error) {
  /* A malformed config must not break the worker for other features. */
  console.error("[sw] push setup failed", error);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      /* A missing optional asset must not fail the whole install. */
      await Promise.all(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {}))
      );
      /* New deployments take over without waiting for every tab to close. */
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const isCacheableAsset = (url) => {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(?:css|js|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|webmanifest)$/i.test(url.pathname)
  );
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* Never touch authenticated data or payment endpoints. */
  if (url.pathname.startsWith("/api/")) return;

  /* Navigations: always try the network first so a new build or a signed-out
     session is never served from a stale copy. */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (error) {
          const cache = await caches.open(CACHE_VERSION);
          return (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          /* Only store complete, successful, public responses. */
          if (response.ok && response.type === "basic") cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })()
  );
});

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
