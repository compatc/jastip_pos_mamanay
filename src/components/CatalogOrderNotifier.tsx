import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ShoppingBag, X } from "lucide-react";

interface ToastItem {
  key: string;
  title: string;
  lines: string[];
  orderId: string;
}

const NOTIFIED_KEY = "catalog_order_notified_v2";
const NOTIFIED_WINDOW_MS = 30 * 60 * 1000;
const POLL_MS = 5000;

function rupiah(n: number): string {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

function loadNotified(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
  } catch {
    return {};
  }
}

function alreadyNotified(id: string): boolean {
  const map = loadNotified();
  const ts = map[id];
  if (!ts) return false;
  if (Date.now() - ts > NOTIFIED_WINDOW_MS) return false;
  return true;
}

function markNotified(id: string) {
  const map = loadNotified();
  map[id] = Date.now();
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}

export default function CatalogOrderNotifier() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const seenOrders = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  function chime() {
    try {
      const Ctx =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx.current) audioCtx.current = new Ctx();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = f;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.42);
      });
    } catch {}
  }

  function nativeNotify(title: string, body: string) {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "/logo.png" });
      } else if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch {}
  }

  function showToast(title: string, lines: string[], orderId: string) {
    const key = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { key, title, lines, orderId }]);
    chime();
    nativeNotify(title, lines.join(" • "));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.key !== key));
    }, 10000);
  }

  async function notifyOrder(row: { id: string; total: number; customer_id: string; status: string; created_at: string }) {
    const id = row.id;
    if (alreadyNotified(id)) return;
    if (seenOrders.current.has(id)) return;
    seenOrders.current.add(id);
    markNotified(id);

    let custName = "";
    if (row.customer_id) {
      const { data: cust } = await supabase.from("customers").select("name").eq("id", row.customer_id).single();
      custName = cust?.name || "";
    }

    const { data: items } = await supabase.from("order_items").select("product_name, quantity, price").eq("order_id", id);
    const itemLines = (items || []).map((it) => `${it.product_name} x${it.quantity}`);

    showToast("🛒 Order Baru dari Katalog!", [
      custName ? `👤 ${custName}` : "",
      ...itemLines,
      `💰 ${rupiah(row.total || 0)}`,
    ].filter(Boolean), id);
  }

  useEffect(() => {
    // First poll: load ALL current "new" orders and mark them as seen (don't notify old ones)
    async function initSeen() {
      try {
        const { data } = await supabase
          .from("orders")
          .select("id")
          .eq("status", "new");
        if (data) {
          for (const row of data) {
            seenOrders.current.add(row.id);
            if (!alreadyNotified(row.id)) markNotified(row.id);
          }
        }
      } catch {}
      initialized.current = true;
    }
    initSeen();

    // Polling for new orders
    const poll = window.setInterval(async () => {
      if (!initialized.current) return;
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, total, customer_id, status, created_at")
          .eq("status", "new")
          .order("created_at", { ascending: true });

        if (error) {
          console.error("[CatalogNotif] poll error:", error.message);
          return;
        }

        if (data) {
          for (const row of data) {
            if (!seenOrders.current.has(row.id) && !alreadyNotified(row.id)) {
              console.log("[CatalogNotif] new order detected:", row.id);
              await notifyOrder(row);
            }
          }
        }
      } catch (e) {
        console.error("[CatalogNotif] poll exception:", e);
      }
    }, POLL_MS);

    // Also try Realtime
    const channel = supabase
      .channel("catalog-new-orders-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload: { new?: { id?: string; total?: number; status?: string; customer_id?: string; created_at?: string } }) => {
          const row = payload.new || {};
          if (row.status !== "new") return;
          console.log("[CatalogNotif] realtime event:", row.id);
          await notifyOrder(row as { id: string; total: number; customer_id: string; status: string; created_at: string });
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(poll);
      channel.unsubscribe();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] space-y-3 w-80">
      {toasts.map((t) => (
        <div
          key={t.key}
          className="bg-white rounded-2xl shadow-2xl border border-emerald-100 overflow-hidden animate-[slideUp_0.3s_ease]"
        >
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-white" />
              <span className="text-white font-bold text-sm">{t.title}</span>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.key !== t.key))}
              className="text-white/70 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-3">
            {t.lines.map((line, i) => (
              <p key={i} className="text-sm text-slate-700 leading-relaxed">
                {line}
              </p>
            ))}
            <button
              onClick={() => {
                setToasts((prev) => prev.filter((x) => x.key !== t.key));
                navigate("/orders");
              }}
              className="mt-3 w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition-all"
            >
              Lihat Pesanan
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
