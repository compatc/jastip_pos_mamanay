import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { CreditCard, BellRing, X } from "lucide-react";

interface ToastItem {
  key: string;
  title: string;
  lines: string[];
}

const NOTIFIED_KEY = "transfer_conf_notified_ids";
const NOTIFIED_WINDOW_MS = 5 * 60 * 1000;
const POLL_MS = 15000;

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

export default function TransferConfirmNotifier() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pending = useRef<Map<string, { id: string; amount: number; customer_name: string }>>(new Map());
  const timer = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const visibleRef = useRef(document.visibilityState !== "hidden");

  useEffect(() => {
    const onVis = () => { visibleRef.current = document.visibilityState !== "hidden"; };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function chime() {
    try {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx.current) audioCtx.current = new Ctx();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const notes = [659.25, 783.99, 987.77, 1318.51];
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

  async function flush() {
    timer.current = null;
    const items = Array.from(pending.current.values());
    pending.current.clear();
    if (items.length === 0) return;
    const total = items.reduce((s, i) => s + (i.amount || 0), 0);
    const title = "Konfirmasi Transfer Baru";
    const lines =
      items.length > 1
        ? [
            `${items.length} konfirmasi menunggu verifikasi`,
            rupiah(total),
          ]
        : [
            `${rupiah(items[0].amount)} dari ${items[0].customer_name || "Tanpa Nama"}`,
            "Menunggu verifikasi",
          ];
    setToasts((prev) => [...prev, { key: `${Date.now()}-${Math.random()}`, title, lines }]);
    chime();
    nativeNotify(title, lines.join(" • "));
    window.setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 6500);
  }

  function queue(id: string, amount: number, customer_name: string, createdAt: string | null) {
    const ts = createdAt ? new Date(createdAt).getTime() : Date.now();
    if (alreadyNotified(id, ts)) return;
    markNotified(id, ts);
    pending.current.set(id, { id, amount: amount || 0, customer_name: customer_name || "" });
    if (timer.current == null) {
      timer.current = window.setTimeout(flush, 1200);
    }
  }

  useEffect(() => {
    const channel = supabase
      .channel("payment-confirmations-insert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "payment_confirmations" },
        (payload: { new?: { id?: string; amount?: number; customer_name?: string; status?: string; created_at?: string | null } }) => {
          const row = payload.new || {};
          if (row.status !== "pending") return;
          queue(row.id || "", row.amount || 0, row.customer_name || "", row.created_at || null);
        }
      )
      .subscribe();

    const poll = window.setInterval(async () => {
      if (!visibleRef.current) return;
      try {
        const { data, error } = await supabase
          .from("payment_confirmations")
          .select("id, amount, customer_name, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10);
        if (error) return;
        (data || []).forEach((r) => queue(r.id, r.amount, r.customer_name, r.created_at));
      } catch {}
    }, POLL_MS);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(poll);
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 w-72">
      {toasts.map((t) => (
        <button
          key={t.key}
          onClick={() => {
            navigate("/payment-confirmations");
            setToasts((prev) => prev.filter((x) => x.key !== t.key));
          }}
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl p-3 shadow-lg shadow-amber-100/60 flex items-start gap-3"
        >
          <CreditCard className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-amber-700 flex items-center gap-1.5">
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
