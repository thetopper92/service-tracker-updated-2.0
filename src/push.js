import { api } from "./api";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

function b64ToBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// "on" | "off" | "denied" | "unsupported" | "ios-install"
export async function pushState() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "unsupported";
  }
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications were not allowed.");
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.get("/api/push/key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await api.post("/api/push/subscribe", { subscription: sub.toJSON(), tz });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
}

// Show a notification right away (used when the app opens and the oil change is due)
export async function showLocalNotification(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: "/?section=oil" } });
    return true;
  } catch {
    return false;
  }
}
