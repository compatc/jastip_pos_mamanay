import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { subscribeToPush, unsubscribeFromPush, getPushSubscription } from "../lib/push";
import { BellRing, X, CheckCircle2, Inbox } from "lucide-react";

interface HistoryItem {
  id: string;
  customer_name: string;
  total: number;
  paid_total: number;
  updated_at: string;
}

function rupiah(n: number): string {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PushStatus = "checking" | "on" | "off" | "denied" | "unsupported";

export default function QrisHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushBusy, setPushBusy] = useState(false);

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
    try {
      if (pushStatus === "on") {
        await unsubscribeFromPush();
        setPushStatus("off");
      } else if (pushStatus === "off" || pushStatus === "denied") {
        const res = await subscribeToPush();
        setPushStatus(res === "on" ? "on" : res === "denied" ? "denied" : "off");
      }
    } catch {
      // gagal, biarkan status tetap
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
        const [ordersRes, custRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, customer_id, total, paid_total, updated_at")
            .eq("payment_type", "qris")
            .order("updated_at", { ascending: false })
            .limit(30),
          supabase.from("customers").select("id, name"),
        ]);
        if (cancelled) return;
        const nameMap = new Map<string, string>();
        (custRes.data || []).forEach((c: { id: string; name: string }) => nameMap.set(c.id, c.name));
        setItems(
          (ordersRes.data || []).map((o: { id: string; customer_id: string; total: number; paid_total: number; updated_at: string }) => ({
            ...o,
            customer_name: nameMap.get(o.customer_id) || "",
          }))
        );
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[80vh] flex flex-col overflow-hidden z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-pink-100/60 shrink-0">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-pink-500" />
            <p className="text-sm font-bold text-gray-800">Histori Notifikasi QRIS</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-pink-100/60 shrink-0">
          <div className="flex items-center justify-between gap-3 bg-pink-50/70 rounded-2xl p-3">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing className="w-4 h-4 text-pink-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-700">Notifikasi di HP ini</p>
                <p className="text-[11px] text-gray-400">
                  {pushStatus === "denied"
                    ? "Izin notifikasi diblokir, buka pengaturan browser"
                    : pushStatus === "unsupported"
                      ? "Perangkat ini tidak mendukung push"
                      : "Muncul walau app ditutup"}
                </p>
              </div>
            </div>
            {pushStatus !== "checking" && pushStatus !== "unsupported" && (
              <button
                onClick={handleTogglePush}
                disabled={pushBusy}
                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
                  pushStatus === "on"
                    ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                    : "bg-pink-500 text-white hover:bg-pink-600"
                }`}
              >
                {pushBusy ? "..." : pushStatus === "on" ? "Nonaktifkan" : "Aktifkan"}
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 space-y-2">
          {loading && (
            <div className="text-center py-10 text-gray-400 text-sm">Memuat...</div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center py-10 text-gray-300">
              <Inbox className="w-8 h-8 mb-2" />
              <p className="text-sm text-gray-400">Belum ada notifikasi QRIS</p>
            </div>
          )}
          {!loading &&
            items.map((it) => (
              <button
                key={it.id}
                onClick={() => {
                  onClose();
                  navigate(`/orders/${it.id}`);
                }}
                className="w-full text-left bg-white border border-pink-100/60 hover:border-pink-200 rounded-2xl p-3 flex items-center gap-3 transition-all"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {it.customer_name || "Tanpa kontak"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {rupiah(it.total)} · {formatDate(it.updated_at)}
                  </p>
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
