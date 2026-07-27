import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import type { PaymentType } from "../types";
import ConfirmationModal from "../components/ConfirmationModal";
import {
  Search,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";

type TabFilter = "all" | "penjualan" | "pembelian" | "belum-dikirim" | "belum-lunas";

const PAYMENT_LABELS: Record<PaymentType, string> = {
  tf: "TF",
  qris: "QRIS",
  split: "Split",
  shopee: "Shopee",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Baru",
  paid: "Dibayar",
  shipped: "Dikirim",
  delivered: "Diterima",
  completed: "Selesai",
};

export default function Orders() {
  const { allOrders, loadAllOrders, deleteOrder } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmOnConfirm, setConfirmOnConfirm] = useState<(() => void) | null>(null);

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmOnConfirm(() => onConfirm);
    setConfirmVisible(true);
  }

  useEffect(() => {
    loadAllOrders();
  }, []);

  const filtered = allOrders.filter((o) => {
    const matchTab =
      tab === "all" ||
      o.order_type === tab ||
      (tab === "belum-dikirim" &&
        o.status !== "shipped" &&
        o.status !== "delivered" &&
        o.status !== "completed") ||
      (tab === "belum-lunas" && !isOrderLunas(o));
    const matchSearch =
      !search ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const countPenjualan = allOrders.filter(
    (o) => o.order_type === "penjualan"
  ).length;
  const countPembelian = allOrders.filter(
    (o) => o.order_type === "pembelian"
  ).length;
  const countBelumDikirim = allOrders.filter(
    (o) =>
      o.status !== "shipped" &&
      o.status !== "delivered" &&
      o.status !== "completed"
  ).length;
  const countBelumLunas = allOrders.filter(
    (o) => !isOrderLunas(o)
  ).length;

  function getOrderStatusColor(order: typeof allOrders[0]): string {
    const isPaid = order.paid_total >= order.total && order.total > 0;
    if (order.status === "completed" && !isPaid) {
      return "bg-red-50 text-red-500 border-red-200";
    }
    if (order.status === "completed" && isPaid) {
      return "bg-emerald-50 text-emerald-500 border-emerald-100";
    }
    return "bg-yellow-50 text-yellow-600 border-yellow-200";
  }

  function isOrderLunas(order: typeof allOrders[0]): boolean {
    return order.paid_total >= order.total && order.total > 0;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-4 pb-3 relative z-10">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari order..."
              className="w-full pl-10 pr-4 py-3 bg-white/80 border border-pink-100 rounded-xl text-gray-700 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
            />
          </div>
          <button
            onClick={() => navigate("/orders/upload")}
            className="w-28 px-4 py-3 bg-white/80 border border-pink-100 hover:bg-pink-50 text-gray-600 rounded-xl font-medium text-base flex items-center justify-center gap-1.5 transition-all shrink-0 active:scale-[0.97]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => navigate("/orders/new")}
            className="w-28 px-4 py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl font-medium text-base flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-pink-200/40 shrink-0 active:scale-[0.97]"
          >
            <ClipboardList className="w-4 h-4" />
            Baru
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setTab("all")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all shrink-0 ${
              tab === "all"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            Semua ({allOrders.length})
          </button>
          <button
            onClick={() => setTab("penjualan")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
              tab === "penjualan"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            Penjualan ({countPenjualan})
          </button>
          <button
            onClick={() => setTab("pembelian")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
              tab === "pembelian"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            <TrendingDown className="w-3 h-3" />
            Pembelian ({countPembelian})
          </button>
          <button
            onClick={() => setTab("belum-dikirim")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all shrink-0 ${
              tab === "belum-dikirim"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            Belum Dikirim ({countBelumDikirim})
          </button>
          <button
            onClick={() => setTab("belum-lunas")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all shrink-0 ${
              tab === "belum-lunas"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            Belum Lunas ({countBelumLunas})
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-5 pb-4 relative z-10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-5">
              <ClipboardList className="w-8 h-8 text-pink-300" />
            </div>
            <p className="text-gray-500 text-xl font-medium">
              {tab === "all"
                ? "Belum ada order"
                : tab === "penjualan"
                  ? "Belum ada penjualan"
                  : "Belum ada pembelian"}
            </p>
            <p className="text-gray-300 text-base mt-1">
              Tap "Baru" untuk membuat order
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) => (
              <div
                key={order.id}
                className="bg-white/80 hover:bg-white border border-pink-100/60 rounded-2xl p-4 flex items-center justify-between transition-all shadow-sm shadow-pink-50 cursor-pointer"
                onClick={() => navigate(`/orders/${order.id}/edit`)}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                      order.order_type === "penjualan"
                        ? "bg-gradient-to-br from-pink-100 to-rose-100 border-pink-200/50"
                        : "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/50"
                    }`}
                  >
                    {order.order_type === "penjualan" ? (
                      <TrendingUp className="w-5 h-5 text-pink-500" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 font-semibold text-base truncate">
                      {order.customer_name || "Tanpa kontak"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-gray-400 text-base">
                        {new Date(order.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400 text-base">
                        {PAYMENT_LABELS[order.payment_type]}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right shrink-0">
                      <p className="text-gray-800 font-bold text-base">
                        Rp {order.total.toLocaleString("id-ID")}
                      </p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {order.status === "completed" && order.paid_total < order.total && (
                          <span className="text-orange-500 text-xs font-semibold">!</span>
                        )}
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border mt-0.5 ${getOrderStatusColor(order)}`}
                        >
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        showConfirm(
                          "Hapus Order?",
                          "Apakah kamu yakin ingin menghapus order ini? Stok produk akan dikembalikan.",
                          async () => {
                            await deleteOrder(order.id);
                            await loadAllOrders();
                          }
                        );
                      }}
                      className="p-2.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all border border-red-100 shrink-0"
                      title="Hapus Order"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <ConfirmationModal
        visible={confirmVisible}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={() => {
          if (confirmOnConfirm) confirmOnConfirm();
          setConfirmVisible(false);
        }}
        onCancel={() => setConfirmVisible(false)}
      />
    </div>
  );
}
