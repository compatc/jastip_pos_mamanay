import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStore } from "../stores/useStore";
import { CheckCircle2, BellRing, X } from "lucide-react";

interface ToastItem {
  key: string;
  title: string;
  lines: string[];
}

const NOTIFIED_KEY = "qris_notified_ids";
const NOTIFIED_WINDOW_MS = 5 * 60 * 1000;
const POLL_MS = 8000;
const POLL_WINDOW_MS = 2 * 60 * 1000;

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

function alreadyNotified(id: string, ts: number): boolean {
  const map = loadNotified();
  return map[id] != null && ts - map[id] < NOTIFIED_WINDOW_MS;
}

function markNotified(id: string, ts: number) {
  const map = loadNotified();
  map[id] = ts;
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}

export default function QrisNotifier() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pending = useRef<Map<string, { total: number }>>(new Map());
  const timer = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  function chime() {
    try {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx.current) audioCtx.current = new Ctx();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const notes = [880, 1174.66, 1567.98];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = f;
        const t = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        osc.start(t);
        osc.stop(t + 0.47);
      });
    } catch {
      // audio tidak didukung, abaikan
    }
  }

  function nativeNotify(title: string, body: string) {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "/logo.png" });
      } else if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch {
      // notifikasi browser tidak tersedia, abaikan
    }
  }

  function flush() {
    timer.current = null;
    const items = Array.from(pending.current.values());
    pending.current.clear();
    if (items.length === 0) return;
    useStore.getState().loadAllOrders();
    const total = items.reduce((s, i) => s + (i.total || 0), 0);
    const title = "QRIS Lunas";
    const lines =
      items.length > 1
        ? [`${items.length} pesanan lunas`, rupiah(total)]
        : [`${rupiah(total)} diterima`];
    setToasts((prev) => [...prev, { key: `${Date.now()}-${Math.random()}`, title, lines }]);
    chime();
    nativeNotify(title, lines.join(" • "));
    window.setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 6500);
  }

  function queue(id: string, total: number, updatedAt: string | null) {
    const ts = updatedAt ? new Date(updatedAt).getTime() : Date.now();
    if (alreadyNotified(id, ts)) return;
    markNotified(id, ts);
    pending.current.set(id, { total: total || 0 });
    if (timer.current == null) {
      timer.current = window.setTimeout(flush, 1200);
    }
  }

  useEffect(() => {
    const channel = supabase
      .channel("qris-paid-orders")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload: { new?: { id?: string; total?: number; payment_type?: string; status?: string; updated_at?: string | null } }) => {
          const row = payload.new || {};
          if (row.payment_type !== "qris" || row.status !== "paid") return;
          queue(row.id || "", row.total || 0, row.updated_at || null);
        }
      )
      .subscribe();

    const poll = window.setInterval(async () => {
      try {
        const since = new Date(Date.now() - POLL_WINDOW_MS).toISOString();
        const { data, error } = await supabase
          .from("orders")
          .select("id, total, updated_at")
          .eq("payment_type", "qris")
          .eq("status", "paid")
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(10);
        if (error) return;
        (data || []).forEach((o) => queue(o.id, o.total, o.updated_at));
      } catch {
        // jaringan bermasalah, coba lagi tick berikutnya
      }
    }, POLL_MS);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(poll);
      if (timer.current != null) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 w-72">
      {toasts.map((t) => (
        <button
          key={t.key}
          onClick={() => {
            navigate("/orders");
            setToasts((prev) => prev.filter((x) => x.key !== t.key));
          }}
          className="w-full text-left bg-emerald-50 border border-emerald-200 rounded-2xl p-3 shadow-lg shadow-emerald-100/60 flex items-start gap-3"
        >
          <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-emerald-700 flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5" />
              {t.title}
            </span>
            {t.lines.map((l) => (
              <span key={l} className="block text-xs text-gray-600 mt-0.5">
                {l}
              </span>
            ))}
          </span>
          <X className="w-4 h-4 text-gray-300 shrink-0" />
        </button>
      ))}
    </div>
  );
}
