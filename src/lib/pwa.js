import { useEffect, useState } from "react";

/* Install experience helpers.
 *
 * The browser decides whether the app can be installed; this module only
 * listens for beforeinstallprompt, remembers a dismissal and reports what the
 * current browser actually supports. Nothing here claims installation when it
 * could not be detected.
 */

const DISMISS_KEY = "sbd:pwa:dismissed-at";
const DISMISS_DAYS = 45;

let deferredPrompt = null;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* storage may be unavailable in private mode */
    }
    emit();
  });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true
  );
}

export function detectPlatform() {
  if (typeof navigator === "undefined") {
    return { ios: false, android: false, desktop: true, iosBrowser: "", canPrompt: false };
  }
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const iosBrowser = /CriOS/i.test(ua)
    ? "Chrome on iOS"
    : /FxiOS/i.test(ua)
      ? "Firefox on iOS"
      : /EdgiOS/i.test(ua)
        ? "Edge on iOS"
        : ios
          ? "Safari"
          : "";
  return { ios, android, desktop: !ios && !android, iosBrowser, canPrompt: Boolean(deferredPrompt) };
}

export function dismissalCooldownActive() {
  try {
    const raw = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!raw) return false;
    return Date.now() - raw < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissInstallPrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  emit();
}

export function clearInstallDismissal() {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export async function promptInstall() {
  if (!deferredPrompt) return { outcome: "unavailable" };
  const prompt = deferredPrompt;
  deferredPrompt = null;
  emit();
  try {
    prompt.prompt();
    const choice = await prompt.userChoice;
    return { outcome: choice?.outcome || "dismissed" };
  } catch {
    return { outcome: "unavailable" };
  }
}

export function usePwaInstall() {
  const [state, setState] = useState(() => ({
    canInstall: Boolean(deferredPrompt),
    installed: isStandalone(),
    ...detectPlatform(),
  }));

  useEffect(() => {
    const update = () =>
      setState({
        canInstall: Boolean(deferredPrompt),
        installed: isStandalone(),
        ...detectPlatform(),
      });
    listeners.add(update);
    window.addEventListener("resize", update);
    const media = window.matchMedia?.("(display-mode: standalone)");
    media?.addEventListener?.("change", update);
    update();
    return () => {
      listeners.delete(update);
      window.removeEventListener("resize", update);
      media?.removeEventListener?.("change", update);
    };
  }, []);

  return {
    ...state,
    dismissed: dismissalCooldownActive(),
    install: promptInstall,
    dismiss: dismissInstallPrompt,
    resetDismissal: clearInstallDismissal,
  };
}

export function installInstructions(platform) {
  if (platform.ios) {
    return [
      "Open this site in Safari (on iPhone or iPad).",
      "Tap the Share button in the toolbar.",
      "Choose “Add to Home Screen”, then tap Add.",
      "Open SBD Solutions from the Home Screen — notifications and the app icon work from there.",
    ];
  }
  if (platform.android) {
    return [
      "Open this site in Chrome (or another Chromium browser).",
      "Tap the three-dot menu, then “Install app” or “Add to Home screen”.",
      "Confirm Install; SBD Solutions appears on your home screen.",
    ];
  }
  return [
    "Open this site in Chrome, Edge or another Chromium browser.",
    "Use the install icon in the address bar, or the browser menu → “Install SBD Solutions”.",
    "Firefox and Safari on desktop do not offer app installation; the site still works in a tab.",
  ];
}
