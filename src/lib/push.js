/* Browser side of phone notifications.
 *
 * The Firebase SDK is loaded from the official CDN on demand — only when the
 * owner presses "Enable phone notifications" — so the dashboard bundle stays
 * small and no server credential is ever involved.
 */

const SDK = "11.6.1";
const APP_SRC = `https://www.gstatic.com/firebasejs/${SDK}/firebase-app-compat.js`;
const MSG_SRC = `https://www.gstatic.com/firebasejs/${SDK}/firebase-messaging-compat.js`;

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((script) => script.src === src)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("The notification library could not be loaded. Check your connection."));
    document.head.appendChild(script);
  });
}

async function loadFirebase() {
  if (window.firebase?.messaging) return window.firebase;
  if (!loading) {
    loading = (async () => {
      await loadScript(APP_SRC);
      await loadScript(MSG_SRC);
      return window.firebase;
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export function pushSupport() {
  const secure = window.isSecureContext || location.hostname === "localhost";
  const supported =
    "serviceWorker" in navigator && "Notification" in window && "PushManager" in window;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  return {
    supported: supported && secure,
    secure,
    ios,
    standalone,
    /* iOS only exposes web push to Home Screen apps. */
    needsHomeScreen: ios && !standalone,
    permission: typeof Notification !== "undefined" ? Notification.permission : "default",
  };
}

/**
 * Ask for permission, register the worker, get an FCM token and return it.
 * Throws a readable error for every failure the owner can act on.
 */
export async function enablePhoneNotifications(publicConfig) {
  const support = pushSupport();
  if (!support.secure) {
    throw new Error("Phone notifications need this site to be served over HTTPS.");
  }
  if (!support.supported) {
    throw new Error("This browser does not support web push notifications.");
  }
  if (support.needsHomeScreen) {
    throw new Error(
      "On iPhone or iPad, add this site to your Home Screen first (Share → Add to Home Screen), then open it from there and try again."
    );
  }
  if (!publicConfig?.config?.projectId || !publicConfig?.vapidKey) {
    throw new Error("Phone notifications are not configured on this server yet.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted. You can allow it in your browser settings.");
  }

  const params = new URLSearchParams({ config: JSON.stringify(publicConfig.config) });
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`,
    { scope: "/" }
  );
  await navigator.serviceWorker.ready;

  const firebase = await loadFirebase();
  const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(publicConfig.config);
  const messaging = firebase.messaging(app);
  const token = await messaging.getToken({
    vapidKey: publicConfig.vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("The browser did not return a notification token. Try again.");
  return token;
}

/* The browser's existing token, if this device is already registered. */
export async function existingToken(publicConfig) {
  try {
    if (!publicConfig?.config?.projectId) return "";
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return "";
    const firebase = await loadFirebase();
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(publicConfig.config);
    return (await firebase.messaging(app).getToken({
      vapidKey: publicConfig.vapidKey,
      serviceWorkerRegistration: registration,
    })) || "";
  } catch {
    return "";
  }
}

export async function deleteToken(publicConfig) {
  try {
    const firebase = await loadFirebase();
    if (!firebase.apps?.length) return;
    await firebase.messaging(firebase.app()).deleteToken();
  } catch {
    /* best effort: the server row is removed by the caller anyway */
  }
}
