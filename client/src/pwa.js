// What the phone can do, and the native-ish bits: the service worker, push
// notifications, the number on the app icon, and writing NFC tags.
import { api } from "./api.js";

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const platform = {
  // iPadOS reports itself as a Mac; touch gives it away.
  ios: /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1),
  android: /Android/.test(ua),
  get standalone() {
    return (
      (typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches) ||
      (typeof navigator !== "undefined" && navigator.standalone === true)
    );
  },
  get pushSupported() {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  },
  // Web NFC: Chrome on Android only (iPhones read tags, but web pages can't write them).
  get nfcWrite() {
    return typeof window !== "undefined" && "NDEFReader" in window;
  },
};

/**
 * Where notifications stand on this device:
 *   "install-first"  iPhone/iPad in Safari: web push only works once it's on the Home Screen
 *   "unsupported"    this browser can't
 *   "denied"         turned off for this site in the phone's settings
 *   "off" | "on"
 */
export async function pushStatus() {
  if (platform.ios && !platform.standalone) return "install-first";
  if (!platform.pushSupported) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("service worker:", e));
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask (must be from a tap), subscribe, and tell the server. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications weren't allowed");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const { publicKey } = await api("GET", "/api/push/key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  try {
    await api("POST", "/api/push/subscribe", sub.toJSON());
  } catch (e) {
    // The server didn't take it: don't leave this device looking subscribed.
    await sub.unsubscribe().catch(() => {});
    throw e;
  }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await api("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
}

/** On every start: if this device has a subscription, make sure the server has it (it may have rotated). */
export async function resyncPush() {
  if (!platform.pushSupported || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) await api("POST", "/api/push/subscribe", sub.toJSON()).catch(() => {});
}

/** The number on the app icon. */
export function setBadge(n) {
  if (!("setAppBadge" in navigator)) return;
  (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

/** Write a tag's link onto a blank NFC tag (Android Chrome). Resolves once written. */
export async function writeTag(url, { signal } = {}) {
  const reader = new window.NDEFReader();
  await reader.write({ records: [{ recordType: "url", data: url }] }, { signal, overwrite: true });
}

// Android/desktop Chrome offer their own install prompt; keep it for an "Install" button.
let deferredInstall = null;
const installListeners = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    installListeners.forEach((f) => f(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    installListeners.forEach((f) => f(false));
  });
}
export const canPromptInstall = () => Boolean(deferredInstall);
export function onInstallable(f) {
  installListeners.add(f);
  return () => installListeners.delete(f);
}
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  return outcome === "accepted";
}
