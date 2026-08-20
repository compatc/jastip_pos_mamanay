import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { payOrderLink } from "../lib/payLinks";
import { supabase } from "../lib/supabase";
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
  RotateCcw,
  CheckCircle2,
  Send,
  PackageCheck,
  CircleDot,
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

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Belum Dibayar",
  dp: "DP",
  paid: "Lunas",
};

const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  belum_ready: "Belum Ready",
  ready: "Ready",
  shipped: "Dikirim",
  diterima: "Diterima",
  completed: "Selesai",
  cancelled: "Dibatalkan",
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

function getStatusColor(fulfillmentStatus: string): string {
  const colors: Record<string, string> = {
    belum_ready: "bg-orange-100 text-orange-600",
    ready: "bg-teal-100 text-teal-600",
    shipped: "bg-amber-100 text-amber-600",
    diterima: "bg-blue-100 text-blue-600",
    completed: "bg-gray-100 text-gray-500",
    cancelled: "bg-red-100 text-red-600",
  };
  return colors[fulfillmentStatus] || "bg-blue-100 text-blue-600";
}

function isOrderLunas(o: { payment_status: string; paid_total: number; total: number }) {
  return o.payment_status === "paid" || o.paid_total >= o.total;
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
    products,
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrisLink, setQrisLink] = useState<string | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [refundItems, setRefundItems] = useState<{ order_item_id: string; product_name: string; quantity: number; price: number; refund_amount: number; max_qty: number }[]>([]);
  const [refundReason, setRefundReason] = useState("");
  const [refundError, setRefundError] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refunds, setRefunds] = useState<any[]>([]);

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

  useEffect(() => {
    async function loadRefunds() {
      if (!orderId) return;
      const { data } = await supabase.from("refunds").select("*").eq("order_id", orderId);
      setRefunds(data || []);
    }
    loadRefunds();
  }, [orderId]);

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

  const totalRefunded = (order.refund_total || 0) + refunds.reduce((s: number, r: any) => s + (r.amount || 0), 0);
  const refundable = order.paid_total - (order.refund_total || 0);

  function openRefundModal() {
    setRefundItems(
      items.map((i) => ({
        order_item_id: i.id,
        product_name: i.product_name,
        quantity: 0,
        price: i.price,
        refund_amount: 0,
        max_qty: i.quantity,
      }))
    );
    setRefundReason("");
    setRefundError("");
    setShowRefund(true);
  }

  function updateRefundQty(idx: number, qty: number) {
    setRefundItems((prev) => {
      const next = [...prev];
      const clamped = Math.max(0, Math.min(qty, next[idx].max_qty));
      next[idx].quantity = clamped;
      next[idx].refund_amount = clamped * next[idx].price;
      return next;
    });
  }

  function updateRefundAmount(idx: number, amount: number) {
    setRefundItems((prev) => {
      const next = [...prev];
      next[idx].refund_amount = Math.max(0, amount);
      return next;
    });
  }

  async function handleRefund() {
    const selected = refundItems.filter((i) => i.quantity > 0);
    if (selected.length === 0) { setRefundError("Pilih minimal 1 produk"); return; }
    const total = selected.reduce((s, i) => s + i.refund_amount, 0);
    if (total > refundable) { setRefundError("Total refund melebihi sisa yang bisa direfund (" + rupiah(refundable) + ")"); return; }
    setRefundLoading(true);
    setRefundError("");
    const { createRefund } = useStore.getState();
    const result = await createRefund(order.id, selected, refundReason);
    setRefundLoading(false);
    if (result.error) { setRefundError(result.error); return; }
    setShowRefund(false);
    await loadAllOrders();
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
    const statusLabel = FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status;

    msg += `📦 Pesanan: ${productNames}\n`;
    msg += `Status barang: ${statusLabel}\n`;
    if (order.notes) msg += `📝 Catatan: ${order.notes}\n`;
    if (order.qris_notes) msg += `📝 Catatan QRIS: ${order.qris_notes}\n`;
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

    const pcsShopee = items.reduce((sum, i) => {
      const product = products.find((p) => p.id === i.product_id);
      const shopeePcs = product?.shopee_pcs || 1;
      return sum + Math.ceil((i.quantity * shopeePcs) / 1000);
    }, 0);

    msg += "Mohon melakukan pembayaran sebelum batas waktu yang ditentukan. ";
    msg += "Setelah transfer, silakan kirim bukti pembayaran agar pesanan dapat segera kami proses.\n";
    msg += "Mohon abaikan apabila sudah melakukan payment.\n\n";

    if (pcsShopee > 0) {
      msg += `🛒 *Checkout di Shopee:* ${pcsShopee} pcs\n`;
      msg += `Link: https://s.shopee.co.id/8pjZ07JBJe\n`;
      msg += `📝 Cantumkan *nama* + *4 digit terakhir nomor HP* pada catatan pesanan.\n`;
      msg += `⚠️ Apabila menggunakan Shopee, kami tidak menanggung resiko apabila paket dinyatakan hilang oleh ekspedisi.\n\n`;
    }

    msg += "Terima kasih atas kepercayaannya. 🙏";
    return msg;
  }

  function buildShopeeMsg(): string {
    if (order.fulfillment_status !== "ready" || items.length === 0) return "";

    let msg = `Halo Kak ${order.customer_name || ""} 🙏\n\n`;
    msg += "Pembayaran sudah masuk ya. Terima kasih banyak 😊\n\n";
    msg += "Untuk pengiriman tersedia melalui ekspedisi manual (JNT/Indopaket) atau Shopee.\n";
    msg += "Apabila menggunakan metode split payment via Shopee, kami tidak menanggung risiko apabila paket dinyatakan hilang oleh pihak ekspedisi. Mohon dimengerti ya 💕\n\n";

    msg += "Barang yang sudah ready:\n";
    let totalPcs = 0;
    items.forEach((item) => {
      const product = products.find((p) => p.id === item.product_id);
      const shopeePcs = product?.shopee_pcs || 1;
      const qtyPcs = Math.ceil((item.quantity * shopeePcs) / 1000);
      totalPcs += qtyPcs;
      msg += `• ${item.product_name} x${item.quantity} → ${qtyPcs} pcs\n`;
    });
    msg += "\n";

    msg += `Total checkout: ${totalPcs} pcs\n\n`;
    msg += "Berikut link Shopee untuk checkout:\n";
    msg += "https://s.shopee.co.id/8pjZ07JBJe\n\n";
    msg += "📝 Mohon cantumkan *nama* + *4 digit terakhir nomor HP* pada catatan pesanan (notes) saat checkout ya, kak.\n\n";
    msg += "⚠️ Mohon diperhatikan, apabila menggunakan Shopee, kami tidak menanggung resiko apapun apabila paket dinyatakan hilang oleh ekspedisi.\n\n";
    msg += "Terima kasih 🙏✨";

    return msg;
  }

  function sendShopeeMsg() {
    const phone = customer?.phone || "";
    const wa = toWaNumber(phone);
    if (!wa) return;
    const msg = buildShopeeMsg();
    if (!msg) {
      alert("Belum ada barang yang statusnya ready.");
      return;
    }
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
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

        <div className="flex items-center gap-2 mb-2">
          <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${getStatusColor(order.fulfillment_status)}`}>
            {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status}
          </span>
          {order.payment_status && (
            <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
              order.payment_status === "paid" ? "bg-emerald-100 text-emerald-600" :
              order.payment_status === "dp" ? "bg-amber-100 text-amber-600" :
              "bg-red-100 text-red-600"
            }`}>
              {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status}
            </span>
          )}
        </div>

        {/* Quick Fulfillment Status Change */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {[
            { value: "belum_ready", label: "Belum Ready", icon: CircleDot, color: "bg-orange-500" },
            { value: "ready", label: "Ready", icon: CheckCircle2, color: "bg-teal-500" },
            { value: "shipped", label: "Dikirim", icon: Send, color: "bg-violet-500" },
            { value: "diterima", label: "Diterima", icon: PackageCheck, color: "bg-blue-500" },
            { value: "completed", label: "Selesai", icon: CheckCircle2, color: "bg-emerald-500" },
          ].map((opt) => {
            const Icon = opt.icon;
            const isActive = order.fulfillment_status === opt.value;
            return (
              <button
                key={opt.value}
                onClick={async () => {
                  await supabase
                    .from("orders")
                    .update({ fulfillment_status: opt.value, updated_at: new Date().toISOString() })
                    .eq("id", order.id);
                  await loadAllOrders();
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all ${
                  isActive
                    ? `${opt.color} text-white shadow-md`
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <Icon className="w-3 h-3" />
                {opt.label}
              </button>
            );
          })}
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
            {customer?.address && (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">📍 {customer.address}</p>
            )}
            {customer?.phone && (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">📱 {customer.phone}</p>
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
            {(order.refund_total || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-red-400 font-bold">Direfund</span>
                <span className="text-red-400 font-bold">-{rupiah(order.refund_total || 0)}</span>
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

          {order.qris_notes && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400 uppercase font-bold mb-1">Catatan QRIS</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{order.qris_notes}</p>
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
              {order.fulfillment_status === "ready" && (
              <button
                onClick={sendShopeeMsg}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                🛒 Kirim Pesan Shopee
              </button>
              )}
              {refundable > 0 && (
              <button
                onClick={openRefundModal}
                className="py-3 px-4 bg-amber-50 hover:bg-amber-100 text-amber-600 font-bold rounded-xl text-sm transition-all border border-amber-200 flex items-center gap-1"
              >
                <RotateCcw className="w-4 h-4" /> Refund
              </button>
              )}
              <button
                onClick={() => setDeleteConfirm(true)}
                className="py-3 px-4 bg-red-50 hover:bg-red-100 text-red-500 font-bold rounded-xl text-sm transition-all border border-red-100"
              >
                <Trash2 className="w-4 h-4" />
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

      {showRefund && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Refund Order</h3>
            <p className="text-xs text-gray-400 mb-3">Sisa refundable: <span className="font-bold text-amber-500">{rupiah(refundable)}</span></p>
            <div className="flex-1 overflow-y-auto space-y-2 mb-3">
              {refundItems.map((ri, idx) => (
                <div key={ri.order_item_id} className="p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{ri.product_name}</p>
                      <p className="text-[10px] text-gray-400">{rupiah(ri.price)} / pcs (max {ri.max_qty})</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateRefundQty(idx, ri.quantity - 1)} className="w-7 h-7 rounded bg-gray-200 text-gray-600 font-bold text-sm">-</button>
                      <span className="w-8 text-center text-sm font-bold">{ri.quantity}</span>
                      <button onClick={() => updateRefundQty(idx, ri.quantity + 1)} className="w-7 h-7 rounded bg-gray-200 text-gray-600 font-bold text-sm">+</button>
                    </div>
                  </div>
                  {ri.quantity > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 pl-0.5">
                      <span className="text-[10px] text-gray-400">Refund:</span>
                      <input
                        type="number"
                        value={ri.refund_amount}
                        onChange={(e) => updateRefundAmount(idx, Number(e.target.value))}
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs font-bold text-red-500 text-right"
                      />
                      <span className="text-[10px] text-gray-400">Rp</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Alasan refund..."
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            {refundError && <p className="text-xs text-red-500 font-semibold mb-2">{refundError}</p>}
            {refundItems.filter(i => i.quantity > 0).length > 0 && (
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-xs text-gray-400">Total Refund</span>
                <span className="text-sm font-extrabold text-red-500">-{rupiah(refundItems.reduce((s, i) => s + i.refund_amount, 0))}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowRefund(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-xl text-sm">Batal</button>
              <button onClick={handleRefund} disabled={refundLoading} className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-sm disabled:opacity-50">
                {refundLoading ? "Proses..." : "Refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
