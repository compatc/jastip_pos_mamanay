import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { payOrderLink } from "../lib/payLinks";
import {
  ArrowLeft,
  Edit2,
  User,
  Package,
  Truck,
  Trash2,
  MessageCircle,
  Copy,
  ExternalLink,
  Check,
  X,
} from "lucide-react";

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

const COURIER_LABELS: Record<string, string> = {
  jnt: "J&T Express",
  indopaket: "Indopaket",
  shopee: "Shopee Express",
};

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    new: "bg-blue-100 text-blue-600",
    "belum-ready": "bg-orange-100 text-orange-600",
    ready: "bg-teal-100 text-teal-600",
    paid: "bg-emerald-100 text-emerald-600",
    shipped: "bg-amber-100 text-amber-600",
    delivered: "bg-violet-100 text-violet-600",
    completed: "bg-gray-100 text-gray-500",
  };
  return colors[status] || "bg-yellow-100 text-yellow-600";
}

function isOrderLunas(o: { status: string; paid_total: number; total: number }) {
  return o.status === "completed" || o.status === "paid" || o.paid_total >= o.total;
}

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo;
  const {
    allOrders,
    loadAllOrders,
    orderItems,
    loadOrderItems,
    customers,
    loadCustomers,
    deleteOrder,
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrisLink, setQrisLink] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      await Promise.all([loadAllOrders(), loadCustomers()]);
      if (orderId) await loadOrderItems(orderId);
      setLoading(false);
    }
    load();
  }, [orderId]);

  useEffect(() => {
    if (order && !isOrderLunas(order) && order.total > 0) {
      payOrderLink(order.id, order.total).then(setQrisLink).catch(() => {});
    }
  }, [order?.id]);

  const order = allOrders.find((o) => o.id === orderId);
  const items = orderItems;
  const customer = order?.customer_id
    ? customers.find((c) => c.id === order.customer_id)
    : null;

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <p className="text-gray-400 text-sm">Order tidak ditemukan</p>
        <button onClick={() => navigate(returnTo || "/orders")} className="mt-3 text-pink-500 font-semibold text-sm">
          Kembali
        </button>
      </div>
    );
  }

  const totalDiscount = items.reduce((sum, i) => sum + (i.discount || 0), 0);
  const sisa = order.total - order.paid_total;
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  function sendWa() {
    const phone = customer?.phone || order.customer_name;
    if (!phone) return;
    const msg = `Halo ${order.customer_name || "Kak"},\nOrder ${shortId(order.id)} Anda:\n${items.map((i) => `- ${i.product_name} x${i.quantity}: ${rupiah(i.price * i.quantity - i.discount)}`).join("\n")}\nTotal: ${rupiah(order.total)}\n\nTerima kasih! 🙏`;
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function handleDelete() {
    await deleteOrder(order.id);
    setDeleteConfirm(false);
    navigate(returnTo || "/orders");
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-3 pb-2 relative z-10">
        <div className="order-header flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate(returnTo || "/orders")}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center shrink-0 hover:bg-gray-50 transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-gray-900">{shortId(order.id)}</h1>
            <p className="text-[11px] text-gray-400">
              {new Date(order.created_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "long", year: "numeric",
              })} · {new Date(order.created_at).toLocaleTimeString("id-ID", {
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
          <button
            onClick={() => navigate(`/orders/${order.id}/edit`, { state: { returnTo: location.pathname } })}
            className="w-9 h-9 rounded-xl bg-pink-500 text-white flex items-center justify-center shrink-0 hover:bg-pink-600 transition-all"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${getStatusColor(order.status)}`}>
            {STATUS_LABELS[order.status] || order.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-white border border-gray-100 rounded-xl p-2.5">
            <p className="text-[9px] text-gray-400 uppercase font-semibold mb-0.5">Pelanggan</p>
            {customer ? (
              <button
                onClick={() => navigate(`/customer/${customer.id}`)}
                className="text-xs font-bold text-pink-500 hover:text-pink-600 truncate block text-left"
              >
                {customer.name}
              </button>
            ) : (
              <p className="text-xs font-bold text-gray-800 truncate">{order.customer_name || "Tanpa kontak"}</p>
            )}
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-2.5">
            <p className="text-[9px] text-gray-400 uppercase font-semibold mb-0.5">Tipe</p>
            <p className="text-xs font-bold text-gray-800 capitalize">{order.order_type === "penjualan" ? "Penjualan" : "Pembelian"}</p>
          </div>
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 relative z-10">
        <div className="space-y-3">

          <div>
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1.5">Item ({items.length})</p>
            <div className="space-y-1.5">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="bg-white border border-gray-100 rounded-xl p-2.5 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center shrink-0">
                    <Package className="w-3.5 h-3.5 text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{item.product_name}</p>
                    <p className="text-[10px] text-gray-400">
                      {item.quantity} × {rupiah(item.price)}
                      {item.discount > 0 && <span className="text-red-400 ml-1">-{rupiah(item.discount)}</span>}
                    </p>
                  </div>
                  <p className="text-xs font-bold text-gray-800 shrink-0">{rupiah(item.price * item.quantity - item.discount)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-1.5">
            {subtotal !== order.total && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-600 font-semibold">{rupiah(subtotal)}</span>
              </div>
            )}
            {totalDiscount > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Diskon Item</span>
                <span className="text-red-400 font-semibold">-{rupiah(totalDiscount)}</span>
              </div>
            )}
            {order.ongkir > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Ongkir</span>
                <span className="text-gray-600 font-semibold">{rupiah(order.ongkir)}</span>
              </div>
            )}
            {order.diskon > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Diskon</span>
                <span className="text-red-400 font-semibold">-{rupiah(order.diskon)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1.5 border-t border-gray-100">
              <span className="text-sm font-bold text-gray-800">Total</span>
              <span className="text-base font-extrabold text-pink-500">{rupiah(order.total)}</span>
            </div>
            {order.paid_total > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Dibayar</span>
                <span className="text-emerald-500 font-bold">{rupiah(order.paid_total)}</span>
              </div>
            )}
            {sisa > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-amber-500 font-bold">Sisa</span>
                <span className="text-amber-500 font-bold">{rupiah(sisa)}</span>
              </div>
            )}
          </div>

          {order.payment_type && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Pembayaran</p>
              <p className="text-xs font-bold text-gray-800">{PAYMENT_LABELS[order.payment_type] || order.payment_type}</p>
              {order.shopee_order_no && (
                <p className="text-[10px] text-gray-400 mt-0.5">No. Shopee: {order.shopee_order_no}</p>
              )}
            </div>
          )}

          {(order.courier || order.resi) && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 flex items-center gap-1">
                <Truck className="w-3 h-3" /> Pengiriman
              </p>
              <p className="text-xs font-bold text-gray-800">{COURIER_LABELS[order.courier || ""] || "Kurir"}</p>
              {order.resi && <p className="text-[10px] text-gray-600 mt-0.5 break-all">{order.resi}</p>}
            </div>
          )}

          {order.notes && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Catatan</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          {!isOrderLunas(order) && order.total > 0 && qrisLink && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Link Pembayaran</p>
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg mb-1.5">
                <div className="w-7 h-7 rounded-md bg-gray-900 text-white flex items-center justify-center shrink-0">
                  <ExternalLink className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-800">QRIS Dinamis</p>
                  <p className="text-[9px] text-gray-400 truncate">{qrisLink}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(qrisLink, "qris")}
                  className="px-2 py-1 bg-pink-500 text-white rounded-md text-[9px] font-bold shrink-0"
                >
                  {copiedId === "qris" ? "✓" : "Salin"}
                </button>
              </div>
            </div>
          )}

          {!isOrderLunas(order) && order.total > 0 && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={sendWa}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Kirim WA
              </button>
              <button
                onClick={() => navigate(`/orders/${order.id}/edit`, { state: { returnTo: location.pathname } })}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all"
              >
                Edit
              </button>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-500 font-bold rounded-xl text-xs transition-all border border-red-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {(isOrderLunas(order) || order.total === 0) && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => navigate(returnTo || "/orders")}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all"
              >
                Kembali
              </button>
              <button
                onClick={() => navigate(`/orders/${order.id}/edit`, { state: { returnTo: location.pathname } })}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all"
              >
                Edit
              </button>
            </div>
          )}

        </div>
      </main>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-gray-800 mb-1">Hapus Order?</h3>
            <p className="text-xs text-gray-400 mb-4">Order ini akan dihapus permanen. Stok produk akan dikembalikan.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-xl transition-all text-xs"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-all text-xs"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
