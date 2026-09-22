import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_EMAIL = process.env.SUPABASE_EMAIL || process.env.BOT_EMAIL;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD || process.env.BOT_PASSWORD;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

let adminPromise = null;

export function getAdmin() {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL belum di-set");
  if (adminPromise) return adminPromise;
  adminPromise = (async () => {
    const svcKey = SUPABASE_SERVICE_ROLE_KEY;
    if (svcKey) return createClient(SUPABASE_URL, svcKey);
    if (!SUPABASE_ANON_KEY || !SUPABASE_EMAIL || !SUPABASE_PASSWORD) throw new Error("Missing Supabase config");
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await sb.auth.signInWithPassword({ email: SUPABASE_EMAIL, password: SUPABASE_PASSWORD });
    if (error) throw new Error("Login Supabase gagal: " + error.message);
    return sb;
  })();
  return adminPromise;
}

export async function sendPushNotification(sb, { title, body, url, type, orderIds, amount }) {
  try {
    const webpush = (await import("web-push")).default;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails("mailto:admin@mamanay.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }
    const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && subs && subs.length > 0) {
      const payload = JSON.stringify({ title, body, url });
      await Promise.allSettled(subs.map(async (s) => {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); }
        catch (err) { if (err?.statusCode === 404 || err?.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", s.id); }
      }));
    }
    try {
      let userId = null;
      try { const { data: { user } } = await sb.auth.getUser(); userId = user?.id || null; } catch {}
      if (!userId) { const { data: authUsers } = await sb.auth.admin.listUsers({ perPage: 1 }); userId = authUsers?.users?.[0]?.id || null; }
      await sb.from("notifications").insert({ user_id: userId, title: title || "QRIS Lunas", body: body || "", url: url || "/orders", type: type || "qris", order_ids: orderIds || [], amount: amount || 0 });
    } catch (e) { console.error("[push] notifications insert failed:", e.message); }
  } catch {}
}
