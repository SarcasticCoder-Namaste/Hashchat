import {
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from "@workspace/api-client-react";

function urlB64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return detectPushSupport().supported;
}

export interface PushSupportInfo {
  supported: boolean;
  reason?: string;
  permission: NotificationPermission | "unknown";
}

export function detectPushSupport(): PushSupportInfo {
  if (typeof window === "undefined") {
    return { supported: false, reason: "No window", permission: "unknown" };
  }
  if (!("serviceWorker" in navigator)) {
    return {
      supported: false,
      reason: "Service Workers not supported",
      permission: "unknown",
    };
  }
  if (!("PushManager" in window)) {
    return {
      supported: false,
      reason: "Push notifications not supported",
      permission: "unknown",
    };
  }
  if (!("Notification" in window)) {
    return {
      supported: false,
      reason: "Notifications API not supported",
      permission: "unknown",
    };
  }
  return { supported: true, permission: Notification.permission };
}

const SW_PATH = `${
  (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")
}/sw.js`;

async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH, { scope: import.meta.env.BASE_URL ?? "/" });
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  const support = detectPushSupport();
  if (!support.supported) return null;
  try {
    const reg = await getOrRegisterServiceWorker();
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<{
  ok: boolean;
  message: string;
}> {
  const support = detectPushSupport();
  if (!support.supported) {
    return { ok: false, message: support.reason ?? "Not supported" };
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, message: "Permission denied" };
  }
  const keyResp = await getVapidPublicKey();
  if (!keyResp.configured || !keyResp.publicKey) {
    return {
      ok: false,
      message: "Push notifications are not configured by the server.",
    };
  }
  const reg = await getOrRegisterServiceWorker();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(keyResp.publicKey) as unknown as BufferSource,
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, message: "Could not extract push keys" };
  }
  await subscribePush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  });
  return { ok: true, message: "Push notifications enabled" };
}

export async function unsubscribeFromPush(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const sub = await getCurrentPushSubscription();
    if (!sub) return { ok: true, message: "Already unsubscribed" };
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    try {
      await unsubscribePush({ endpoint });
    } catch {
      // tolerate server-side cleanup failure
    }
    return { ok: true, message: "Push notifications disabled" };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
