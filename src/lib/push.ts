import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const clean = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(clean);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function supportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!supportsPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? await reg.pushManager.getSubscription() : null;
}

export type PushResult = "on" | "denied" | "unavailable" | "error";

export async function subscribeToPush(): Promise<PushResult> {
  if (!supportsPush()) return "unavailable";
  if (!("Notification" in window)) return "unavailable";

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "unavailable";

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return "error";

  const endpoint = sub.endpoint;
  const p256dh = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh") as ArrayBuffer)));
  const pushAuth = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth") as ArrayBuffer)));

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint, p256dh, auth: pushAuth, updated_at: new Date().toISOString() },
      { onConflict: "endpoint" }
    );
  return error ? "error" : "on";
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getPushSubscription();
  if (sub) await sub.unsubscribe();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user?.id) {
    await supabase.from("push_subscriptions").delete().eq("user_id", auth.user.id);
  }
}
