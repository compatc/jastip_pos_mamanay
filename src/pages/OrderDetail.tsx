import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { ArrowLeft, Edit2, User, Package } from "lucide-react";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function shortId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return "NAY" + String(Math.abs(hash) % 10000).padStart(4, "0");
}

const STATUS_LABELS: Record<string, string> = {
  new: "Baru",
  "belum-ready": "Belum Ready",
  ready: "Ready",
  paid: "Dibayar",
  shipped: "Dikirim",
  delivered: "Diterima",
  completed: "Selesai",
};

const PAYMENT_LABELS: Record<string, string> = {
  tf: "Transfer Bank",
  qris: "QRIS",
  split: "Split",
  shopee: "Shopee",
  cash: "Cash",
};

function getStatusBadge(status: string): string {
  const colors: Record<string, string> = {
    new: "bg-blue-50 text-blue-600 border-blue-200",
    "belum-ready": "bg-orange-50 text-orange-600 border-orange-200",
    ready: "bg-teal-50 text-teal-600 border-teal-200",
    paid: "bg-emerald-50 text-emerald-600 border-emerald-200",
    shipped: "bg-amber-50 text-amber-600 border-amber-200",
    delivered: "bg-violet-50 text-violet-600 border-violet-200",
    completed: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return colors[status] || "bg-yellow-50 text-yellow-600 border-yellow-200";
}

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo;
  const { allOrders, loadAllOrders, orderItems, loadOrderItems, customers, loadCustomers } = useStore();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      await Promise.all([loadAllOrders(), loadCustomers()]);
      if (orderId) await loadOrderItems(orderId);
      setLoading(false);
    }
    load();
  }, [orderId]);

  const order = allOrders.find((o) => o.id === orderId);
  const items = orderItems;
  const customer = order?.customer_id
    ? customers.find((c) => c.id === order.customer_id)
    : null;

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50">
        <div className="w-10 h-10 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50">
        <p className="text-gray-400">Order tidak ditemukan</p>
        <button onClick={() => navigate(returnTo || "/orders")} className="mt-4 text-pink-500 font-semibold">
          Kembali
        </button>
      </div>
    );
  }

  const totalDiscount = items.reduce((sum, i) => sum + (i.discount || 0), 0);
  const sisa = order.total - order.paid_total;

  return (
    <div className="h-full flex flex-col">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-200/30 rounded-full blur-3xl" />
      </div>

      <header className="shrink-0 bg-white/70 backdrop-blur-xl border-b border-pink-100/60 relative z-10">
        <div className="px-5 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(returnTo || "/orders")}
            className="p-2.5 hover:bg-pink-50 rounded-xl transition-all border border-pink-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-800 truncate">
              {shortId(order.id)}
            </h1>
            <p className="text-sm text-gray-400">
              {new Date(order.created_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <button
            onClick={() => navigate(`/orders/${order.id}/edit`, { state: { returnTo: location.pathname } })}
            className="p-2.5 bg-gradient-to-r from-pink-400 to-rose-500 text-white rounded-xl transition-all shadow-lg shadow-pink-200/40 active:scale-[0.97]"
          >
            <Edit2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="px-5 py-4 space-y-4 pb-8">

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Status
            </label>
            <span className={`inline-block px-3 py-1.5 rounded text-sm font-semibold border ${getStatusBadge(order.status)}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Pelanggan
            </label>
            {customer ? (
              <button
                onClick={() => navigate(`/customer/${customer.id}`)}
                className="flex items-center gap-2 text-pink-500 hover:text-pink-600 font-semibold transition-colors"
              >
                <User className="w-4 h-4" />
                {customer.name}
              </button>
            ) : (
              <p className="text-gray-700 font-semibold">
                {order.customer_name || "Tanpa kontak"}
              </p>
            )}
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Tipe Order
            </label>
            <p className="text-gray-700 font-semibold capitalize">
              {order.order_type === "penjualan" ? "Penjualan" : "Pembelian"}
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Item
            </label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-gray-300 shrink-0" />
                        {item.product_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {item.quantity} x {rupiah(item.price)}
                        {item.discount > 0 && (
                          <span className="text-red-400 ml-2">-{rupiah(item.discount)}</span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-800 shrink-0">
                      {rupiah(item.price * item.quantity - item.discount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50 space-y-2">
            {totalDiscount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Diskon Item</span>
                <span className="text-red-400">-{rupiah(totalDiscount)}</span>
              </div>
            )}
            {order.ongkir > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Ongkir</span>
                <span className="text-gray-700">{rupiah(order.ongkir)}</span>
              </div>
            )}
            {order.diskon > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Diskon</span>
                <span className="text-red-400">-{rupiah(order.diskon)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-pink-100">
              <span className="text-gray-800">Total</span>
              <span className="text-gray-800">{rupiah(order.total)}</span>
            </div>
            {order.paid_total > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Dibayar</span>
                <span className="text-emerald-600 font-semibold">{rupiah(order.paid_total)}</span>
              </div>
            )}
            {sisa > 0 && (
              <div className="flex items-center justify-between text-sm font-bold">
                <span className="text-amber-600">Sisa</span>
                <span className="text-amber-600">{rupiah(sisa)}</span>
              </div>
            )}
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Pembayaran
            </label>
            <p className="text-gray-700 font-semibold">
              {PAYMENT_LABELS[order.payment_type] || order.payment_type}
            </p>
          </div>

          {order.notes && (
            <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
              <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                Catatan
              </label>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate(returnTo || "/orders")}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-2xl transition-all"
            >
              Kembali
            </button>
            <button
              onClick={() => navigate(`/orders/${order.id}/edit`, { state: { returnTo: location.pathname } })}
              className="flex-1 py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-pink-200/40"
            >
              Edit
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
