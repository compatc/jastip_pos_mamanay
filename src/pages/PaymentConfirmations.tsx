import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  X,
  Clock,
  CreditCard,
  Eye,
  Image,
  ExternalLink,
  Filter,
  Banknote,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface PaymentConfirmation {
  id: string;
  order_id: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  transfer_date: string;
  bukti_url: string;
  status: string;
  created_at: string;
}

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function fmtDate(s: string) {
  if (!s) return "-";
  const d = new Date(s);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PaymentConfirmations() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PaymentConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/payment-confirmations?status=" + filter);
      const json = await res.json();
      setItems(json.data || []);
    } catch (e) {
      console.error("Load confirmations error:", e);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [filter]);

  async function handleAction(id: string, action: "approve" | "reject") {
    if (actionLoading) return;
    if (action === "reject" && !confirm("Tolak konfirmasi ini?")) return;
    if (action === "approve" && !confirm("Setujui konfirmasi ini? Order akan ditandai lunas sesuai nominal.")) return;

    setActionLoading(id);
    try {
      const res = await fetch("/api/payment-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (json.ok) {
        loadData();
      } else {
        alert("Gagal: " + (json.error || "Unknown error"));
      }
    } catch (e) {
      alert("Gagal menghubungi server");
    }
    setActionLoading(null);
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <div className="h-full flex flex-col relative z-10">
      <main className="flex-1 px-4 py-4 max-w-4xl w-full mx-auto overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/")}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-800">
              Konfirmasi Bayar
              {pendingCount > 0 && (
                <span className="ml-2 text-sm font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  {pendingCount} baru
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-400">Verifikasi transfer BCA dari pelanggan</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {(["all", "pending", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                filter === f
                  ? "bg-pink-500 text-white border-pink-500"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {f === "all" ? "Semua" : f === "pending" ? "Menunggu" : f === "approved" ? "Disetujui" : "Ditolak"}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 font-medium">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <Banknote className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Tidak ada konfirmasi</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-4 transition-all ${
                  item.status === "pending"
                    ? "border-amber-200 shadow-sm shadow-amber-100"
                    : item.status === "approved"
                    ? "border-emerald-200"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-extrabold text-slate-800 truncate">
                        {item.customer_name || "Tanpa Nama"}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                          item.status === "pending"
                            ? "bg-amber-50 text-amber-600 border-amber-200"
                            : item.status === "approved"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                            : "bg-red-50 text-red-600 border-red-200"
                        }`}
                      >
                        {item.status === "pending" ? "Menunggu" : item.status === "approved" ? "Disetujui" : "Ditolak"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Order #{item.order_id.slice(0, 8)} · {fmtDate(item.created_at)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-slate-400 text-xs">Nominal Bayar</span>
                    <p className="font-bold text-slate-800">{rupiah(item.amount)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs">Tanggal Transfer</span>
                    <p className="font-bold text-slate-800">{item.transfer_date || "-"}</p>
                  </div>
                </div>

                {/* Bukti Preview */}
                {item.bukti_url && (
                  <div className="mb-3">
                    <button
                      onClick={() => setPreviewImg(item.bukti_url)}
                      className="flex items-center gap-2 text-xs font-semibold text-pink-600 hover:text-pink-700"
                    >
                      <Image className="w-4 h-4" />
                      Lihat Bukti Transfer
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Actions */}
                {item.status === "pending" && (
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleAction(item.id, "reject")}
                      disabled={!!actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 text-red-600 font-bold text-sm border border-red-200 hover:bg-red-100 transition-all disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      {actionLoading === item.id ? "..." : "Tolak"}
                    </button>
                    <button
                      onClick={() => handleAction(item.id, "approve")}
                      disabled={!!actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm border border-emerald-600 hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-md shadow-emerald-200"
                    >
                      <Check className="w-4 h-4" />
                      {actionLoading === item.id ? "..." : "Setujui & Lunas"}
                    </button>
                  </div>
                )}

                {/* Go to Order */}
                <button
                  onClick={() => navigate("/orders/" + item.order_id)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-pink-500 font-medium py-1 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Lihat Order
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Image Preview Modal */}
      {previewImg && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={previewImg}
              alt="Bukti Transfer"
              className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain"
            />
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-600 font-bold text-lg"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
