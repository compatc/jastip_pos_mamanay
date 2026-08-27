import { Fragment, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import { payOrderLink, payGroupLink } from "../lib/payLinks";
import ConfirmationModal from "../components/ConfirmationModal";
import {
  ArrowLeft,
  Plus,
  Package,
  Trash2,
  MessageCircle,
  CheckCheck,
} from "lucide-react";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
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

const FULFILLMENT_STATUS_ORDER = ["belum_ready", "ready", "shipped", "diterima", "completed", "cancelled"];

function getOrderStatusBadge(order: any): { label: string; cls: string; accent: string } {
  const paid = order.payment_status === "paid" || (order.paid_total >= order.total && order.total > 0);
  if (paid && order.fulfillment_status === "completed") return { label: "Selesai", cls: "bg-gray-100 text-gray-500", accent: "bg-gray-300" };
  if (paid) return { label: "Lunas", cls: "bg-emerald-50 text-emerald-600", accent: "bg-emerald-400" };
  const map: Record<string, { label: string; cls: string; accent: string }> = {
    belum_ready: { label: "Belum Ready", cls: "bg-orange-50 text-orange-600", accent: "bg-orange-400" },
    ready: { label: "Ready", cls: "bg-amber-50 text-amber-600", accent: "bg-amber-400" },
    shipped: { label: "Dikirim", cls: "bg-violet-50 text-violet-600", accent: "bg-violet-400" },
    diterima: { label: "Diterima", cls: "bg-blue-50 text-blue-600", accent: "bg-blue-400" },
    completed: { label: "Selesai", cls: "bg-gray-100 text-gray-500", accent: "bg-gray-300" },
    cancelled: { label: "Dibatalkan", cls: "bg-red-50 text-red-600", accent: "bg-red-400" },
  };
  return map[order.fulfillment_status] || { label: FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status, cls: "bg-yellow-50 text-yellow-600", accent: "bg-yellow-400" };
}

interface OrderItemData {
  product_name: string;
  variant?: string | null;
  quantity: number;
  price: number;
  discount: number;
  product_id: string;
}

type FilterType = "all" | "unpaid" | "dikemas" | "completed";

function itemLabel(i: { product_name: string; variant?: string | null }) {
  return i.variant ? `${i.product_name} ${i.variant}` : i.product_name;
}

export default function CustomerOrders() {
  const { customerId } = useParams<{ customerId: string }>();
  const {
    orders,
    loadOrders,
    customers,
    loadCustomers,
    deleteOrder,
    markOrdersPaid,
    products,
  } = useStore();
  const navigate = useNavigate();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmOnConfirm, setConfirmOnConfirm] = useState<(() => void) | null>(null);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemData[]>>({});
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [paidModalOpen, setPaidModalOpen] = useState(false);
  const [selectedPaidOrders, setSelectedPaidOrders] = useState<Set<string>>(new Set());
  const [markingPaid, setMarkingPaid] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  function toggleSelectOrder(id: string) {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePaidOrder(id: string) {
    setSelectedPaidOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openPaidModal() {
    const unpaid = orders.filter((o) => o.paid_total < o.total && o.total > 0);
    setSelectedPaidOrders(new Set(unpaid.map((o) => o.id)));
    setPaidModalOpen(true);
  }

  function openWaModal() {
    const unpaid = orders.filter((o) => o.paid_total < o.total && o.total > 0);
    setSelectedOrders(new Set(unpaid.map((o) => o.id)));
    setWaModalOpen(true);
  }

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmOnConfirm(() => onConfirm);
    setConfirmVisible(true);
  }

  useEffect(() => {
    if (customerId) {
      loadCustomers();
      loadOrders(customerId);
    }
  }, [customerId]);

  useEffect(() => {
    if (orders.length === 0) return;
    async function loadAllItems() {
      const ids = orders.map((o) => o.id);
      const { data } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity, price, discount, product_id, variant")
        .in("order_id", ids);
      if (!data) return;
      const map: Record<string, OrderItemData[]> = {};
      for (const row of data) {
        if (!map[row.order_id]) map[row.order_id] = [];
        map[row.order_id].push({ product_name: row.product_name, quantity: row.quantity, price: row.price, discount: row.discount || 0, product_id: row.product_id, variant: row.variant });
      }
      setItemsByOrder(map);
    }
    loadAllItems();
  }, [orders]);

  const customer = customers.find((c) => c.id === customerId);
  const unpaidOrders = orders.filter((o) => o.paid_total < o.total && o.total > 0);

  const totalBelanja = orders.reduce((s, o) => s + o.total, 0);
  const totalLunas = orders.filter((o) => o.paid_total >= o.total && o.total > 0).length;
  const sisaPiutang = unpaidOrders.reduce((s, o) => s + (o.total - (o.paid_total || 0)), 0);
  const totalPiutang = unpaidOrders.reduce((s, o) => s + o.total, 0);

  const filteredOrders = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "unpaid") return o.payment_status === "unpaid" && o.total > 0;
    if (filter === "dikemas") {
      const isPaid = o.payment_status === "paid" || o.paid_total >= o.total;
      return isPaid && ["belum_ready", "ready"].includes(o.fulfillment_status);
    }
    if (filter === "completed") {
      if (o.fulfillment_status !== "completed") return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const items = itemsByOrder[o.id] || [];
        const idMatch = o.id.toLowerCase().includes(q);
        const itemMatch = items.some((i) => itemLabel(i).toLowerCase().includes(q));
        if (!idMatch && !itemMatch) return false;
      }
      if (selectedMonth !== "all") {
        const d = new Date(o.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key !== selectedMonth) return false;
      }
      return true;
    }
    return true;
  }).sort((a, b) => {
    const timeA = a.payment_status === "paid" ? (a.updated_at || a.created_at) : a.created_at;
    const timeB = b.payment_status === "paid" ? (b.updated_at || b.created_at) : b.created_at;
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });

  const completedOrders = filteredOrders.filter((o) => o.fulfillment_status === "completed");

  const availableMonths = (() => {
    const monthSet = new Set<string>();
    orders.forEach((o) => {
      if (o.fulfillment_status === "completed") {
        const d = new Date(o.created_at);
        monthSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    });
    return Array.from(monthSet).sort().reverse();
  })();

  const groupedByMonth = (() => {
    const groups: Record<string, typeof completedOrders> = {};
    completedOrders.forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(o);
    });
    return groups;
  })();

  const filterCounts = {
    all: orders.length,
    unpaid: orders.filter((o) => o.payment_status === "unpaid" && o.total > 0).length,
    dikemas: orders.filter((o) => {
      const isPaid = o.payment_status === "paid" || o.paid_total >= o.total;
      return isPaid && ["belum_ready", "ready"].includes(o.fulfillment_status);
    }).length,
    completed: completedOrders.length,
  };

  function sendWhatsApp(selected: typeof orders) {
    const phone = customer?.phone;
    if (!phone || selected.length === 0) return;

    const paymentLabels: Record<string, string> = {
      tf: "Transfer Bank",
      qris: "QRIS",
      split: "Split",
      shopee: "Shopee",
      cash: "Tunai",
    };

    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const deadlineStr = deadline.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let msg = `Halo Kak ${customer?.name} \u{1F60A}\n\n`;
    msg += "Terima kasih sudah berbelanja di *Jastip_mamanay*.\n\n";
    msg += "Berikut kami kirimkan invoice untuk pesanan Kakak:\n\n";

    let grandTotal = 0;
    let grandPaid = 0;
    const grouped: Record<string, typeof selected> = {};
    selected.forEach((order) => {
      const key = order.fulfillment_status;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    });
    FULFILLMENT_STATUS_ORDER.forEach((status) => {
      const list = grouped[status];
      if (!list) return;
      list.forEach((order) => {
        const items = itemsByOrder[order.id] || [];
        const productNames = items.map((i) => `${itemLabel(i)} x${i.quantity}`).join(", ");
        const statusLabel = FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status;
        msg += `\u{1F4E6} Pesanan: ${productNames}\n`;
        msg += `Status barang: ${statusLabel}\n`;
        if (order.notes) msg += `\u{1F4DD} Catatan: ${order.notes}\n`;
        if (order.qris_notes) msg += `\u{1F4DD} Catatan QRIS: ${order.qris_notes}\n`;
        msg += `\u{1F4B0} Total Tagihan: *${rupiah(order.total)}*\n`;
        const paid = order.paid_total || 0;
        if (paid > 0) {
          msg += `Sudah dibayar: ${rupiah(paid)}\n`;
          msg += `Sisa: ${rupiah(order.total - paid)}\n`;
        }
        msg += "\n";
        grandTotal += order.total;
        grandPaid += paid;
      });
    });

    if (selected.length > 1) {
      msg += `\u{1F4CA} *Grand Total: ${rupiah(grandTotal)}*\n`;
      msg += `Total dibayar: ${rupiah(grandPaid)}\n`;
      msg += `*Sisa: ${rupiah(grandTotal - grandPaid)}*\n\n`;
    }

    const qrisOrders = selected.filter((o) => o.total - (o.paid_total || 0) > 0);
    if (qrisOrders.length > 0) {
      msg += `\u{1F4B3} *Bayar QRIS sekarang:*\n`;
      if (qrisOrders.length === 1) {
        const order = qrisOrders[0];
        const sisa = order.total - (order.paid_total || 0);
        const items = itemsByOrder[order.id] || [];
        const productNames = items.map((i) => `${itemLabel(i)} x${i.quantity}`).join(", ");
        msg += `1. ${productNames}\n`;
        msg += `\u{1F4B0} Sisa: *${rupiah(sisa)}*\n`;
        msg += `Klik di sini untuk bayar pakai QRIS sekarang:\n${payOrderLink(order.id)}\n\n`;
      } else {
        const qrisIds = qrisOrders.map((o) => o.id);
        qrisOrders.forEach((order, idx) => {
          const sisa = order.total - (order.paid_total || 0);
          const items = itemsByOrder[order.id] || [];
          const productNames = items.map((i) => `${itemLabel(i)} x${i.quantity}`).join(", ");
          msg += `${idx + 1}. ${productNames}\n`;
          msg += `\u{1F4B0} Sisa: *${rupiah(sisa)}*\n\n`;
        });
        const totalSisa = qrisOrders.reduce((s, o) => s + (o.total - (o.paid_total || 0)), 0);
        msg += `\u{1F9FE} Total sisa: *${rupiah(totalSisa)}* (${qrisOrders.length} pesanan digabung dalam 1 QRIS)\n`;
        msg += `Klik di sini untuk bayar pakai QRIS sekarang:\n${payGroupLink(qrisIds)}\n\n`;
      }
    }

    const payMethod = paymentLabels[selected[0]?.payment_type] || "Transfer Bank";
    msg += `\u{1F4B3} Metode Pembayaran: ${payMethod}\n`;
    msg += "BCA 5271330651 a.n. Nurul Azizah\n";
    msg += `\u{23F0} Batas Pembayaran: ${deadlineStr}\n\n`;

    const totalWeight = selected.reduce((sum, order) => {
      const items = itemsByOrder[order.id] || [];
      return sum + items.reduce((s, i) => {
        const product = products.find((p) => p.id === i.product_id);
        const shopeePcs = product?.shopee_pcs || 1;
        return s + (i.quantity * shopeePcs);
      }, 0);
    }, 0);
    const pcsShopee = Math.ceil(totalWeight / 1000);

    msg += "Mohon melakukan pembayaran sebelum batas waktu yang ditentukan. ";
    msg += "Setelah transfer, silakan kirim bukti pembayaran agar pesanan dapat segera kami proses.\n\n";

    if (pcsShopee > 0) {
      msg += `\u{1F6D2} *Checkout di Shopee:* ${pcsShopee} pcs\n`;
      msg += `Link: https://s.shopee.co.id/8pjZ07JBJe\n`;
      msg += `\u{1F4DD} Cantumkan *nama* + *4 digit terakhir nomor HP* pada catatan pesanan.\n`;
      msg += `\u26A0\uFE0F Apabila menggunakan Shopee, kami tidak menanggung resiko apabila paket dinyatakan hilang oleh ekspedisi.\n\n`;
    }

    msg += "Terima kasih atas kepercayaannya. \u{1F64F}";

    const cleaned = phone.replace(/\D/g, "");
    const wa = cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned.startsWith("62") ? cleaned : "62" + cleaned;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function renderOrderCard(order: any, isCompletedTab: boolean) {
    const items = itemsByOrder[order.id] || [];
    const badge = getOrderStatusBadge(order);
    const paid = order.payment_status === "paid" || order.paid_total >= order.total;
    const sisa = order.total - (order.paid_total || 0);
    const productNames = items.map((i) => `${itemLabel(i)} x${i.quantity}`).join(", ");
    const dateStr = new Date(order.created_at).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const timeStr = new Date(order.created_at).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const showPaidBadge = isCompletedTab ? false : paid;
    const statusLabel = isCompletedTab ? "Selesai" : badge.label;
    const statusCls = isCompletedTab ? "bg-emerald-50 text-emerald-600" : badge.cls;

    return (
      <div
        key={order.id}
        onClick={() =>
          navigate(`/orders/${order.id}`, {
            state: { returnTo: `/customer/${customerId}` },
          })
        }
        className={`bg-white border border-slate-100 rounded-xl p-3.5 relative overflow-hidden cursor-pointer active:bg-slate-50 transition-colors ${isCompletedTab ? "opacity-70" : ""}`}
      >
        <div className={`absolute top-0 left-0 w-[3px] h-full ${isCompletedTab ? "bg-emerald-400" : badge.accent}`} />
        <div className="flex justify-between items-start mb-2 pl-2">
          <div>
            <div className="text-base font-extrabold text-slate-800">{shortId(order.id)}</div>
            <div className="text-xs text-slate-400">{dateStr} · {timeStr}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${statusCls}`}>{statusLabel}</span>
            {showPaidBadge && (
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-600">Lunas ✓</span>
            )}
          </div>
        </div>
        {productNames && (
          <div className="text-sm text-slate-500 mb-2 pl-2 leading-relaxed">{productNames}</div>
        )}
        <div className="flex justify-between items-center pl-2">
          <div className={`text-lg font-extrabold ${!paid && order.total > 0 ? "text-red-500" : "text-slate-800"}`}>
            {rupiah(order.total)}
          </div>
          {paid ? (
            <span className="text-sm text-emerald-500 font-semibold">Lunas ✓</span>
          ) : (
            <span className="text-sm text-amber-500 font-bold">Sisa: {rupiah(sisa)}</span>
          )}
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
                await loadOrders(customerId!);
              }
            );
          }}
          className="absolute top-3 right-3 p-1.5 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg transition-colors"
          title="Hapus Order"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative z-10">
      <main className="flex-1 px-4 py-4 max-w-7xl w-full mx-auto overflow-y-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/")}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-800 truncate">
              {customer?.name || "Pelanggan"}
            </h1>
            <p className="text-sm text-slate-400">{orders.length} transaksi</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openPaidModal}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
            >
              <CheckCheck className="w-4 h-4 inline mr-1" />
              Lunas
            </button>
            <button
              onClick={() =>
                navigate("/orders/new", {
                  state: { contactName: customer?.name, returnTo: `/customer/${customerId}` },
                })
              }
              className="px-4 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Order
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
            <div className="text-xl font-extrabold text-pink-500">
              {totalBelanja > 999999
                ? `${(totalBelanja / 1000000).toFixed(1)}jt`
                : totalBelanja > 999
                ? `${Math.round(totalBelanja / 1000)}rb`
                : rupiah(totalBelanja)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Total Belanja</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
            <div className="text-xl font-extrabold text-blue-500">{orders.length}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Transaksi</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
            <div className="text-xl font-extrabold text-emerald-500">{totalLunas}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Lunas</div>
          </div>
        </div>

        {/* Loyalty Card */}
        {customer && (
          <div className={`rounded-xl p-4 mb-4 border ${
            customer.member_level === 'platinum' ? 'bg-gradient-to-r from-violet-500 to-purple-600 border-violet-300' :
            customer.member_level === 'gold' ? 'bg-gradient-to-r from-amber-400 to-orange-500 border-amber-300' :
            'bg-gradient-to-r from-slate-500 to-slate-600 border-slate-300'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white/80 text-xs font-medium uppercase tracking-wide">Poin Loyalitas</div>
                <div className="text-white text-2xl font-extrabold">{(customer.points || 0).toLocaleString("id-ID")}</div>
              </div>
              <div className="text-right">
                <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
                  customer.member_level === 'platinum' ? 'bg-white/20 text-white' :
                  customer.member_level === 'gold' ? 'bg-white/20 text-white' :
                  'bg-white/20 text-white'
                }`}>
                  {customer.member_level === 'platinum' ? '💎 Platinum' :
                   customer.member_level === 'gold' ? '🥇 Gold' :
                   '🥈 Silver'}
                </div>
                <div className="text-white/70 text-xs mt-1">
                  Diskon: Rp{Math.min(Math.floor((customer.points || 0) / 100 * 1000), 20000).toLocaleString("id-ID")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Piutang Banner */}
        {unpaidOrders.length > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-bold text-amber-600">Belum Lunas</span>
              <span className="text-sm font-semibold text-amber-500">{unpaidOrders.length} transaksi</span>
            </div>
            <div className="text-2xl font-black text-amber-800">{rupiah(sisaPiutang)}</div>
            <div className="text-sm text-amber-600 mt-0.5">Sisa tagihan dari total {rupiah(totalPiutang)}</div>
            <button
              onClick={openWaModal}
              className="w-full mt-3 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            >
              <MessageCircle className="w-4 h-4" />
              Kirim Tagihan via WA
            </button>
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
          {([
            ["all", "Semua"],
            ["unpaid", "Belum Bayar"],
            ["dikemas", "Dikemas"],
            ["completed", "Selesai"],
          ] as [FilterType, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${
                filter === key
                  ? "bg-pink-500 text-white border-pink-500"
                  : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {label} ({filterCounts[key]})
            </button>
          ))}
        </div>

        {/* Search & Month Filter (Selesai tab only) */}
        {filter === "completed" && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Cari order..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-pink-400"
            />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 focus:outline-none focus:border-pink-400"
            >
              <option value="all">Semua Bulan</option>
              {availableMonths.map((m) => {
                const [y, mo] = m.split("-");
                const date = new Date(Number(y), Number(mo) - 1);
                const label = date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
                return <option key={m} value={m}>{label}</option>;
              })}
            </select>
          </div>
        )}

        {/* Order List */}
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-pink-50 border border-pink-100 rounded-2xl flex items-center justify-center mb-4">
              <Package className="w-7 h-7 text-pink-300" />
            </div>
            <p className="text-gray-500 font-semibold">Belum ada transaksi</p>
            <p className="text-gray-300 text-sm mt-1">Tap "Order" untuk membuat baru</p>
          </div>
        ) : filter === "completed" ? (
          <div className="space-y-4">
            {Object.entries(groupedByMonth).map(([monthKey, monthOrders]) => {
              const [y, mo] = monthKey.split("-");
              const date = new Date(Number(y), Number(mo) - 1);
              const monthLabel = date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
              const monthTotal = monthOrders.reduce((s, o) => s + o.total, 0);
              return (
                <div key={monthKey}>
                  <div className="flex justify-between items-center mb-2 px-1">
                    <span className="text-sm font-bold text-slate-700">{monthLabel}</span>
                    <span className="text-xs text-slate-400">{monthOrders.length} order · {rupiah(monthTotal)}</span>
                  </div>
                  <div className="space-y-2.5">
                    {monthOrders.map((order) => renderOrderCard(order, true))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredOrders.map((order) => renderOrderCard(order, false))}
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

      {/* WA Modal */}
      {waModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setWaModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3 z-10 max-h-[85vh] flex flex-col overflow-hidden">
            <p className="text-base font-bold text-gray-800 shrink-0">Pilih Tagihan</p>
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2 -mx-5 px-5">
              {orders.map((order) => {
                const isUnpaid = order.paid_total < order.total && order.total > 0;
                const items = itemsByOrder[order.id] || [];
                return (
                  <label
                    key={order.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedOrders.has(order.id) ? "bg-green-50 border-green-200" : "bg-white border-gray-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.id)}
                      onChange={() => toggleSelectOrder(order.id)}
                      className="w-4 h-4 accent-green-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800 truncate">
                          {shortId(order.id)}
                        </span>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${getOrderStatusBadge(order).cls}`}>
                          {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status}
                        </span>
                        {!isUnpaid && (
                          <span className="text-[10px] text-emerald-500 font-semibold">LUNAS</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                        {items.map((i) => `${itemLabel(i)} x${i.quantity}`).join(", ")}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 font-semibold">{rupiah(order.total)}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 shrink-0">
              <span className="text-xs text-gray-400">{selectedOrders.size} dipilih</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setWaModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    const selected = orders.filter((o) => selectedOrders.has(o.id));
                    if (selected.length === 0) return;
                    sendWhatsApp(selected);
                    setWaModalOpen(false);
                  }}
                  disabled={selectedOrders.size === 0}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 text-white disabled:text-gray-400 rounded-xl text-sm font-semibold transition-all"
                >
                  Kirim WA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paid Modal */}
      {paidModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPaidModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3 z-10 max-h-[85vh] flex flex-col overflow-hidden">
            <p className="text-base font-bold text-gray-800 shrink-0">Tandai Lunas</p>
            <p className="text-xs text-gray-400 leading-relaxed shrink-0">
              Pilih order yang sudah dibayar, lalu tandai lunas sekaligus.
            </p>
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2 -mx-5 px-5">
              {unpaidOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-400">
                  Semua order sudah lunas.
                </div>
              )}
              {unpaidOrders.map((order) => {
                const items = itemsByOrder[order.id] || [];
                return (
                  <label
                    key={order.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedPaidOrders.has(order.id) ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPaidOrders.has(order.id)}
                      onChange={() => togglePaidOrder(order.id)}
                      className="w-4 h-4 accent-emerald-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800 truncate">
                          {shortId(order.id)}
                        </span>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${getOrderStatusBadge(order).cls}`}>
                          {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                        {items.map((i) => `${itemLabel(i)} x${i.quantity}`).join(", ")}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 font-semibold">
                        Tagihan: {rupiah(order.total - (order.paid_total || 0))}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 shrink-0">
              <span className="text-xs text-gray-400">{selectedPaidOrders.size} dipilih</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaidModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={async () => {
                    const selected = orders.filter((o) => selectedPaidOrders.has(o.id));
                    if (selected.length === 0) return;
                    setMarkingPaid(true);
                    try {
                      await markOrdersPaid(selected.map((o) => o.id));
                      await loadOrders(customerId!);
                      setPaidModalOpen(false);
                    } finally {
                      setMarkingPaid(false);
                    }
                  }}
                  disabled={selectedPaidOrders.size === 0 || markingPaid}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 text-white disabled:text-gray-400 rounded-xl text-sm font-semibold transition-all"
                >
                  {markingPaid ? "Menyimpan..." : "Tandai Lunas"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function shortId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return "NAY" + String(Math.abs(hash) % 10000).padStart(4, "0");
}
