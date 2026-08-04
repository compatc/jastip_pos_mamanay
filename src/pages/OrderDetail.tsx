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

function toWaNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("0")
    ? "62" + cleaned.slice(1)
    : cleaned.startsWith("62")
      ? cleaned
      : "62" + cleaned;
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
  cash: "Tunai",
};

const COURIER_LABELS: Record<string, string> = {
  jnt: "J&T Express",
  indopaket: "Indopaket",
  shopee: "Shopee Express",
};

const BANK_INFO = "BCA 5271330651 a.n. Nurul Azizah";

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

  const order = allOrders.find((o) => o.id === orderId);
  const items = orderItems;
  const customer = order?.customer_id
    ? customers.find((c) => c.id === order.customer_id)
    : null;

  useEffect(() => {
    if (order && !isOrderLunas(order) && order.total > 0) {
      setQrisLink(payOrderLink(order.id));
    }
  }, [order?.id]);

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
        <p className="text-gray-400">Order tidak ditemukan</p>
        <button onClick={() => navigate(returnTo || "/orders")} className="mt-4 text-pink-500 font-semibold">
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

  function buildInvoiceMsg(): string {
    const deadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const deadlineStr = deadline.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let msg = `Halo Kak ${order.customer_name || ""} 🙏\n\n`;
    msg += "Terima kasih sudah berbelanja di *Jastip_mamanay*.\n\n";
    msg += "Berikut kami kirimkan invoice untuk pesanan Kakak:\n\n";

    const productNames = items.map((i) => `${i.product_name} x${i.quantity}`).join(", ");
    const payMethod = PAYMENT_LABELS[order.payment_type] || order.payment_type;
    const statusLabel = STATUS_LABELS[order.status] || order.status;

    msg += `📦 Pesanan: ${productNames}\n`;
    msg += `Status barang: ${statusLabel}\n`;
    if (order.notes) msg += `📝 Catatan: ${order.notes}\n`;
    msg += `Metode: ${payMethod}\n`;
    msg += `💰 Total Tagihan: *Rp ${order.total.toLocaleString("id-ID")}*\n`;
    if (order.paid_total > 0) {
      msg += `Sudah dibayar: Rp ${order.paid_total.toLocaleString("id-ID")}\n`;
      msg += `Sisa: Rp ${(order.total - order.paid_total).toLocaleString("id-ID")}\n`;
    }
    msg += "\n";

    if (qrisLink) {
      const sisa = order.total - order.paid_total;
      msg += `💳 *Bayar QRIS sekarang:*\n`;
      msg += `${productNames}\n`;
      msg += `💰 Sisa: *Rp ${sisa.toLocaleString("id-ID")}*\n`;
      msg += `Klik di sini untuk bayar pakai QRIS sekarang:\n${qrisLink}\n\n`;
    }

    msg += `💳 Metode Pembayaran: ${payMethod}\n`;
    msg += `${BANK_INFO}\n`;
    msg += `⏰ Batas Pembayaran: ${deadlineStr}\n\n`;

    msg += "Mohon melakukan pembayaran sebelum batas waktu yang ditentukan. ";
    msg += "Setelah transfer, silakan kirim bukti pembayaran agar pesanan dapat segera kami proses.\n";
    msg += "Mohon abaikan apabila sudah melakukan payment.\n\n";
    msg += "Terima kasih atas kepercayaannya. 🙏";
    return msg;
  }

  function sendWa() {
    const phone = customer?.phone || "";
    const wa = toWaNumber(phone);
    if (!wa) return;
    const msg = buildInvoiceMsg();
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function handleDelete() {
    await deleteOrder(order.id);
    setDeleteConfirm(false);
    navigate(returnTo || "/orders");
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-4 pb-3 relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(returnTo || "/orders")}
            className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center shrink-0 hover:bg-gray-50 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-gray-900">{shortId(order.id)}</h1>
            <p className="text-sm text-gray-400">
              {new Date(order.created_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "long", year: "numeric",
              })} · {new Date(order.created_at).toLocaleTimeString("id-ID", {
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
          <button
            onClick={() => navigate(`/orders/${order.id}/edit`, { state: { returnTo: location.pathname } })}
            className="w-10 h-10 rounded-xl bg-pink-500 text-white flex items-center justify-center shrink-0 hover:bg-pink-600 transition-all"
          >
            <Edit2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${getStatusColor(order.status)}`}>
            {STATUS_LABELS[order.status] || order.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Pelanggan</p>
            {customer ? (
              <button
                onClick={() => navigate(`/customer/${customer.id}`)}
                className="text-sm font-bold text-pink-500 hover:text-pink-600 truncate block text-left"
              >
                {customer.name}
              </button>
            ) : (
              <p className="text-sm font-bold text-gray-800 truncate">{order.customer_name || "Tanpa kontak"}</p>
            )}
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Tipe</p>
            <p className="text-sm font-bold text-gray-800 capitalize">{order.order_type === "penjualan" ? "Penjualan" : "Pembelian"}</p>
          </div>
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 relative z-10">
        <div className="space-y-4">

          <div>
            <p className="text-xs text-gray-400 uppercase font-bold mb-2">Item ({items.length})</p>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-400">
                      {item.quantity} × {rupiah(item.price)}
                      {item.discount > 0 && <span className="text-red-400 ml-1">-{rupiah(item.discount)}</span>}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-800 shrink-0">{rupiah(item.price * item.quantity - item.discount)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-3.5 space-y-2">
            {subtotal !== order.total && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-600 font-semibold">{rupiah(subtotal)}</span>
              </div>
            )}
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Diskon Item</span>
                <span className="text-red-400 font-semibold">-{rupiah(totalDiscount)}</span>
              </div>
            )}
            {order.ongkir > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Ongkir</span>
                <span className="text-gray-600 font-semibold">{rupiah(order.ongkir)}</span>
              </div>
            )}
            {order.diskon > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Diskon</span>
                <span className="text-red-400 font-semibold">-{rupiah(order.diskon)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-base font-bold text-gray-800">Total</span>
              <span className="text-lg font-extrabold text-pink-500">{rupiah(order.total)}</span>
            </div>
            {order.paid_total > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Dibayar</span>
                <span className="text-emerald-500 font-bold">{rupiah(order.paid_total)}</span>
              </div>
            )}
            {sisa > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-500 font-bold">Sisa</span>
                <span className="text-amber-500 font-bold">{rupiah(sisa)}</span>
              </div>
            )}
          </div>

          {order.payment_type && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400 uppercase font-bold mb-1">Pembayaran</p>
              <p className="text-sm font-bold text-gray-800">{PAYMENT_LABELS[order.payment_type] || order.payment_type}</p>
              {order.shopee_order_no && (
                <p className="text-xs text-gray-400 mt-0.5">No. Shopee: {order.shopee_order_no}</p>
              )}
            </div>
          )}

          {(order.courier || order.resi) && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400 uppercase font-bold mb-1 flex items-center gap-1.5">
                <Truck className="w-4 h-4" /> Pengiriman
              </p>
              <p className="text-sm font-bold text-gray-800">{COURIER_LABELS[order.courier || ""] || "Kurir"}</p>
              {order.resi && <p className="text-xs text-gray-600 mt-0.5 break-all">{order.resi}</p>}
            </div>
          )}

          {order.notes && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400 uppercase font-bold mb-1">Catatan</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          {!isOrderLunas(order) && order.total > 0 && qrisLink && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400 uppercase font-bold mb-2">Link Pembayaran</p>
              <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                  <ExternalLink className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">QRIS Dinamis</p>
                  <p className="text-[10px] text-gray-400 truncate">{qrisLink}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(qrisLink, "qris")}
                  className="px-2.5 py-1.5 bg-pink-500 text-white rounded-lg text-[10px] font-bold shrink-0"
                >
                  {copiedId === "qris" ? "✓" : "Salin"}
                </button>
              </div>
            </div>
          )}

          {!isOrderLunas(order) && order.total > 0 && (
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={sendWa}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> Kirim WA
              </button>
              <button
                onClick={() => navigate(`/orders/${order.id}/edit`, { state: { returnTo: location.pathname } })}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-all"
              >
                Edit
              </button>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="py-3 px-4 bg-red-50 hover:bg-red-100 text-red-500 font-bold rounded-xl text-sm transition-all border border-red-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {(isOrderLunas(order) || order.total === 0) && (
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => navigate(returnTo || "/orders")}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-all"
              >
                Kembali
              </button>
              <button
                onClick={() => navigate(`/orders/${order.id}/edit`, { state: { returnTo: location.pathname } })}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-all"
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
            <h3 className="text-lg font-bold text-gray-800 mb-1">Hapus Order?</h3>
            <p className="text-sm text-gray-400 mb-4">Order ini akan dihapus permanen. Stok produk akan dikembalikan.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-xl transition-all text-sm"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-all text-sm"
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
