import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { subscribeToPush, unsubscribeFromPush, getPushSubscription } from "../lib/push";
import { catOf, isRead, markRead, type NotifCat } from "../lib/notifRead";
import { BellRing, X, Inbox, CheckCircle2, ShoppingBag, Truck, Package, Mail } from "lucide-react";

interface HistoryItem {
  id: string;
  title: string;
  body: string;
  url: string;
  order_ids: string[] | null;
  amount: number;
  type: string;
  created_at: string;
}

type Tab = "all" | NotifCat;

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "payment", label: "💳 QRIS" },
  { key: "order", label: "🛒 Order" },
  { key: "shipping", label: "🚚 Shipping" },
];

const CAT_META: Record<NotifCat, { label: string; grad: string; Icon: typeof Truck }> = {
  payment: { label: "Pembayaran", grad: "linear-gradient(135deg,#10b981,#059669)", Icon: CheckCircle2 },
  order: { label: "Order Masuk", grad: "linear-gradient(135deg,#ec4899,#e11d48)", Icon: ShoppingBag },
  shipping: { label: "Pengiriman", grad: "linear-gradient(135deg,#f59e0b,#d97706)", Icon: Truck },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shipIcon(title: string) {
  const t = (title || "").toUpperCase();
  if (t.includes("MASUK")) return Package;
  if (t.includes("MANUAL")) return Mail;
  return Truck;
}

type PushStatus = "checking" | "on" | "off" | "denied" | "unsupported";

export default function NotifAdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [tick, setTick] = useState(0);
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPushStatus("checking");
    (async () => {
      try {
        const sub = await getPushSubscription();
        if (cancelled) return;
        if (sub) {
          setPushStatus("on");
        } else if (!("Notification" in window)) {
          setPushStatus("unsupported");
        } else if (Notification.permission === "denied") {
          setPushStatus("denied");
        } else {
          setPushStatus("off");
        }
      } catch {
        if (!cancelled) setPushStatus("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleTogglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    setPushError("");
    try {
      if (pushStatus === "on") {
        await unsubscribeFromPush();
        setPushStatus("off");
      } else if (pushStatus === "off" || pushStatus === "denied") {
        const res = await subscribeToPush();
        if (res === "on") {
          setPushStatus("on");
        } else if (res === "denied") {
          setPushStatus("denied");
          setPushError("Izin notifikasi diblokir. Buka pengaturan browser lalu izinkan.");
        } else if (res === "unavailable") {
          setPushStatus("off");
          setPushError("Notifikasi tidak tersedia. Pastikan VITE_VAPID_PUBLIC_KEY di-set saat build.");
        } else {
          setPushStatus("off");
          setPushError("Gagal menyimpan perangkat. Pastikan tabel push_subscriptions sudah dibuat (SQL).");
        }
      }
    } catch {
      setPushError("Terjadi kesalahan saat mengaktifkan notifikasi.");
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from("notifications")
          .select("id, title, body, url, order_ids, amount, type, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (cancelled) return;
        setItems((data as HistoryItem[]) || []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const grouped = useMemo(() => {
    const groups: Record<Tab, HistoryItem[]> = { all: [], payment: [], order: [], shipping: [] };
    for (const it of items) groups[catOf(it.type)].push(it);
    groups.all = items;
    return groups;
  }, [items]);

  const unreadByCat = useMemo(() => {
    const c: Record<NotifCat, number> = { payment: 0, order: 0, shipping: 0 };
    for (const it of items) {
      if (!isRead(it.id, it.created_at)) c[catOf(it.type)]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tick]);

  const unreadTotal = unreadByCat.payment + unreadByCat.order + unreadByCat.shipping;

  function doRead(id: string) {
    markRead(id);
    setTick((t) => t + 1);
  }

  function openNotif(it: HistoryItem) {
    doRead(it.id);
    onClose();
    const listLevel = !it.url || it.url === "/" || it.url === "/orders";
    const firstId = Array.isArray(it.order_ids) ? it.order_ids[0] : undefined;
    navigate(!listLevel ? it.url : firstId ? `/orders/${firstId}` : "/orders");
  }

  if (!open) return null;

  const visible = grouped[tab];

  function renderCard(it: HistoryItem) {
    const cat = catOf(it.type);
    const meta = CAT_META[cat];
    const Icon = cat === "shipping" ? shipIcon(it.title) : meta.Icon;
    const unread = !isRead(it.id, it.created_at);
    const [head, ...rest] = (it.body || "").split("\n");
    return (
      <div
        key={it.id}
        className={`bg-white rounded-2xl p-3 border transition-all ${
          unread ? "border-pink-200 shadow-[0_4px_14px_rgba(236,72,153,.10)]" : "border-slate-100 bg-slate-50/70 opacity-75"
        }`}
      >
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: meta.grad }}
          >
            <Icon className="w-4 h-4 text-white" />
          </div>
          <p className={`text-[13px] font-bold truncate flex-1 ${unread ? "text-slate-900" : "text-slate-500"}`}>
            {it.title || meta.label}
          </p>
          {unread ? (
            <span className="bg-rose-600 text-white text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full shrink-0">
              BARU
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 shrink-0">{formatDate(it.created_at)}</span>
          )}
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
          <p className="text-xs text-slate-700 leading-relaxed">{head}</p>
          {rest.length > 0 && (
            <p className="text-[11px] text-slate-500 whitespace-pre-line leading-snug mt-0.5">
              {rest.slice(0, 3).join("\n")}
              {rest.length > 3 ? `\n+${rest.length - 3} item lain` : ""}
            </p>
          )}
          {unread && <p className="text-[10px] text-slate-400 mt-1">{formatDate(it.created_at)}</p>}
        </div>
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => doRead(it.id)}
            className="flex-1 py-2 bg-white border-[1.5px] border-slate-200 text-slate-500 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all"
          >
            ✓ Tandai selesai
          </button>
          <button
            onClick={() => openNotif(it)}
            className="flex-1 py-2 text-white text-xs font-bold rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 shadow-[0_6px_14px_rgba(225,29,72,.28)] hover:opacity-95 transition-all"
          >
            Buka order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-pink-100/60 shrink-0 bg-gradient-to-r from-pink-500 to-rose-600">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-white" />
            <p className="text-sm font-bold text-white">Notifikasi Admin</p>
            {unreadTotal > 0 && (
              <span className="bg-white text-rose-600 text-[9.5px] font-black tracking-wider px-2 py-0.5 rounded-full">
                {unreadTotal} BARU
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-2.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-700">Notifikasi di HP ini</p>
              <p className="text-[10.5px] text-slate-400">
                {pushStatus === "denied"
                  ? "Izin notifikasi diblokir, buka pengaturan browser"
                  : pushStatus === "unsupported"
                    ? "Perangkat ini tidak mendukung push"
                    : "Muncul walau app ditutup"}
              </p>
            </div>
            {pushStatus !== "checking" && pushStatus !== "unsupported" && (
              <button
                onClick={handleTogglePush}
                disabled={pushBusy}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
                  pushStatus === "on"
                    ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                    : "bg-pink-500 text-white hover:bg-pink-600"
                }`}
              >
                {pushBusy ? "..." : pushStatus === "on" ? "Nonaktifkan" : "Aktifkan"}
              </button>
            )}
          </div>
          {pushError && <p className="text-[11px] text-rose-500 mt-1.5 px-1">{pushError}</p>}
        </div>

        <div className="flex gap-1.5 px-4 py-2.5 border-b border-slate-100 shrink-0 overflow-x-auto">
          {TABS.map((t) => {
            const count = t.key === "all" ? unreadTotal : unreadByCat[t.key as NotifCat];
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold whitespace-nowrap transition-all border-[1.5px] ${
                  active
                    ? "bg-pink-50 border-pink-200 text-pink-600"
                    : "bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100"
                }`}
              >
                {t.label}
                <span
                  className={`min-w-[17px] h-[17px] px-1 rounded-full text-[9.5px] font-black flex items-center justify-center ${
                    count > 0
                      ? active
                        ? "bg-rose-600 text-white"
                        : "bg-slate-200 text-slate-500"
                      : "bg-transparent text-slate-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2.5">
          {loading && <div className="text-center py-10 text-slate-400 text-sm">Memuat...</div>}
          {!loading && visible.length === 0 && (
            <div className="flex flex-col items-center py-10 text-slate-300">
              <Inbox className="w-8 h-8 mb-2" />
              <p className="text-sm text-slate-400">Belum ada notifikasi</p>
            </div>
          )}
          {!loading &&
            tab === "all" &&
            (["payment", "order", "shipping"] as NotifCat[]).map((cat) => {
              const list = grouped[cat];
              if (list.length === 0) return null;
              const meta = CAT_META[cat];
              return (
                <div key={cat} className="space-y-2.5">
                  <div className="flex items-center gap-2 pt-1">
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{ background: meta.grad }}
                    >
                      <meta.Icon className="w-3 h-3 text-white" />
                    </div>
                    <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">{meta.label}</p>
                    <span className="text-[9.5px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-2">
                      {list.length}
                    </span>
                  </div>
                  {list.map(renderCard)}
                </div>
              );
            })}
          {!loading && tab !== "all" && visible.map(renderCard)}
        </div>
      </div>
    </div>
  );
}
