import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import { payOrderLink, payGroupLink } from "../lib/payLinks";
import type { Order, PaymentType } from "../types";
import ConfirmationModal from "../components/ConfirmationModal";

async function getBotApiUrl(): Promise<string> {
  try {
    const { data, error } = await supabase.from("settings").select("value").eq("key", "bot_api_url").maybeSingle();
    if (error) console.error("getBotApiUrl error:", error.message);
    if (data?.value) return data.value;
  } catch (e) {
    console.error("getBotApiUrl fetch error:", e);
  }
  return "http://localhost:3001";
}
import {
  Search,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  Package,
  PackageCheck,
  BellRing,
  MessageCircle,
  Check,
  Copy,
  ExternalLink,
  Eye,
  X,
} from "lucide-react";

type TabFilter = "all" | "penjualan" | "pembelian" | "belum-dikirim" | "belum-lunas" | "belum-diambil" | "lunas" | "ready";

const PAYMENT_LABELS: Record<PaymentType, string> = {
  tf: "TF",
  qris: "QRIS",
  split: "Split",
  shopee: "Shopee",
  cash: "Cash",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Baru",
  "belum-ready": "Belum Ready",
  ready: "Ready",
  paid: "Dibayar",
  shipped: "Dikirim",
  delivered: "Diterima",
  completed: "Selesai",
};

const COURIER_LABELS: Record<string, string> = {
  jnt: "J&T",
  indopaket: "Indopaket",
  shopee: "Shopee",
};

const PAYMENT_LABELS_FULL: Record<string, string> = {
  tf: "Transfer Bank",
  qris: "QRIS",
  split: "Split",
  shopee: "Shopee",
  cash: "Tunai",
};

const BANK_INFO = "BCA 5271330651 a.n. Nurul Azizah";

const BOT_API_TOKEN = import.meta.env.VITE_BOT_API_TOKEN || "mamanay2026";

type CustomerGroup = {
  customerId: string;
  name: string;
  phone: string;
  orders: Order[];
};

export default function Orders() {
  const { allOrders, loadAllOrders, deleteOrder, customers, loadCustomers, products, loadProducts } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [tab, setTab] = useState<TabFilter>((searchParams.get("tab") as TabFilter) || "all");
  const [productFilter, setProductFilter] = useState(searchParams.get("product") || "");
  const [showProductSuggest, setShowProductSuggest] = useState(false);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, { product_name: string; quantity: number; product_id: string }[]>>({});

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmOnConfirm, setConfirmOnConfirm] = useState<(() => void) | null>(null);

  const [waModalOpen, setWaModalOpen] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewGroup, setPreviewGroup] = useState<CustomerGroup | null>(null);
  const [previewQris, setPreviewQris] = useState<{ order: Order; url: string }[] | undefined>(undefined);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLabel, setConfirmLabel] = useState("Hapus");
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [sendProgress, setSendProgress] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);

  async function updateOrderStatus(orderId: string, newStatus: string) {
    setUpdatingStatus(orderId);
    await supabase
      .from("orders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    await loadAllOrders();
    setUpdatingStatus(null);
  }

  function showConfirm(title: string, message: string, onConfirm: () => void, label = "Hapus") {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmLabel(label);
    setConfirmOnConfirm(() => onConfirm);
    setConfirmVisible(true);
  }

  useEffect(() => {
    loadAllOrders();
    loadCustomers();
  }, []);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (search) params.q = search;
    if (tab !== "all") params.tab = tab;
    if (productFilter) params.product = productFilter;
    setSearchParams(params, { replace: true });
  }, [search, tab, productFilter]);

  useEffect(() => {
    if (allOrders.length === 0) return;
    async function loadItems() {
      const ids = allOrders.map((o) => o.id);
      if (ids.length === 0) { setItemsByOrder({}); return; }
      const { data } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity, product_id")
        .in("order_id", ids);
      const map: Record<string, { product_name: string; quantity: number; product_id: string }[]> = {};
      if (data) {
        for (const row of data) {
          if (!map[row.order_id]) map[row.order_id] = [];
          map[row.order_id].push({ product_name: row.product_name, quantity: row.quantity, product_id: row.product_id });
        }
      }
      setItemsByOrder(map);
    }
    loadItems();
  }, [allOrders]);

  const allProductNames = [...new Set(Object.values(itemsByOrder).flat().map((i) => i.product_name))].sort();

  const readyTargets = useMemo(() => {
    if (!productFilter) return [];
    return allOrders.filter(
      (o) =>
        ["new", "belum-ready"].includes(o.status) &&
        (itemsByOrder[o.id] || []).some((i) => i.product_name === productFilter)
    );
  }, [allOrders, productFilter, itemsByOrder]);

  function matchTabFilter(o: (typeof allOrders)[0], tabFilter: string): boolean {
    return (
      tabFilter === "all" ||
      o.order_type === tabFilter ||
      (tabFilter === "lunas" && isOrderLunas(o)) ||
      (tabFilter === "ready" && o.status === "ready") ||
      (tabFilter === "belum-dikirim" &&
        o.status !== "shipped" &&
        o.status !== "delivered" &&
        o.status !== "completed") ||
      (tabFilter === "belum-lunas" && !isOrderLunas(o) && o.total > 0) ||
      (tabFilter === "belum-diambil" &&
        o.order_type === "penjualan" &&
        isOrderLunas(o) &&
        ["new", "belum-ready", "ready", "paid"].includes(o.status))
    );
  }

  const baseFiltered = allOrders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      (itemsByOrder[o.id] || []).some((i) => i.product_name.toLowerCase().includes(q));
    const matchProduct =
      !productFilter ||
      (itemsByOrder[o.id] || []).some((i) => i.product_name === productFilter);
    return matchSearch && matchProduct;
  });

  const filtered = baseFiltered.filter((o) => matchTabFilter(o, tab));

  function countTab(tabFilter: string): number {
    return baseFiltered.filter((o) => matchTabFilter(o, tabFilter)).length;
  }

  const countPenjualan = countTab("penjualan");
  const countPembelian = countTab("pembelian");
  const countBelumDikirim = countTab("belum-dikirim");
  const countBelumLunas = countTab("belum-lunas");
  const countBelumDiambil = countTab("belum-diambil");

  function getOrderStatusColor(order: typeof allOrders[0]): string {
    const colors: Record<string, string> = {
      new: "bg-blue-50 text-blue-600 border-blue-200",
      "belum-ready": "bg-orange-50 text-orange-600 border-orange-200",
      ready: "bg-teal-50 text-teal-600 border-teal-200",
      paid: "bg-emerald-50 text-emerald-600 border-emerald-200",
      shipped: "bg-amber-50 text-amber-600 border-amber-200",
      delivered: "bg-violet-50 text-violet-600 border-violet-200",
      completed: "bg-gray-100 text-gray-500 border-gray-200",
    };
    return colors[order.status] || "bg-yellow-50 text-yellow-600 border-yellow-200";
  }

  function isOrderLunas(order: typeof allOrders[0]): boolean {
    return order.paid_total >= order.total && order.total > 0;
  }

  function getAgeDays(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.max(0, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
  }

  function getAgeBadge(days: number): string {
    if (days <= 2) return "bg-emerald-50 text-emerald-600 border-emerald-200";
    if (days <= 7) return "bg-amber-50 text-amber-600 border-amber-200";
    return "bg-red-50 text-red-600 border-red-200";
  }

  const sortedOrders = [...filtered];
  if (tab === "belum-lunas" || tab === "belum-diambil") {
    sortedOrders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  const totalPiutang = filtered
    .filter((o) => !isOrderLunas(o))
    .reduce((s, o) => s + (o.total - o.paid_total), 0);

  const totalBelumDiambil = filtered.reduce((s, o) => s + o.total, 0);

  function sendReminder(order: (typeof allOrders)[0]) {
    const customer = customers.find((c) => c.id === order.customer_id);
    const phone = customer?.phone || "";
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) {
      alert(`Nomor WA untuk ${order.customer_name || "pelanggan ini"} belum diisi.`);
      return;
    }
    const wa = cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned.startsWith("62") ? cleaned : "62" + cleaned;

    const items = itemsByOrder[order.id] || [];
    const productText = items.map((i) => `${i.product_name} x${i.quantity}`).join(", ");
    const sisa = order.total - order.paid_total;
    const statusLabel = STATUS_LABELS[order.status] || order.status;

    const deadlineBase = order.invoice_sent_at || order.created_at;
    const deadline = new Date(new Date(deadlineBase).getTime() + 2 * 24 * 60 * 60 * 1000);
    const deadlineStr = deadline.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let msg = `Halo Kak ${order.customer_name || ""} \u{1F64F}\n\n`;
    msg += "Pengingat untuk pesanan di *Jastip_mamanay*:\n\n";
    msg += `\u{1F4E6} Pesanan: ${productText}\n`;
    msg += `Status barang: ${statusLabel}\n`;
    msg += `\u{1F4B0} Total Tagihan: *Rp ${order.total.toLocaleString("id-ID")}*\n`;
    if (order.paid_total > 0) {
      msg += `Sudah dibayar: Rp ${order.paid_total.toLocaleString("id-ID")}\n`;
    }
    msg += `\u{23F0} Sisa: *Rp ${sisa.toLocaleString("id-ID")}*\n`;
    msg += `\u{23F0} Batas Pembayaran: *${deadlineStr}* (2 hari setelah invoice)\n\n`;

    const pcsShopee = items.reduce((sum, i) => {
      const product = products.find((p) => p.id === i.product_id);
      const shopeePcs = product?.shopee_pcs || 1;
      return sum + Math.ceil((i.quantity * shopeePcs) / 1000);
    }, 0);

    if (sisa > 0) {
      msg += `\u{1F4B3} *Bayar QRIS sekarang:*\n`;
      msg += `Klik di sini untuk bayar pakai QRIS:\n${payOrderLink(order.id)}\n\n`;
      msg += `\u{1F3E6} *Transfer Bank BCA:*\n`;
      msg += `${BANK_INFO}\n\n`;
    }

    msg += "Mohon segera konfirmasi pembayaran agar pesanan dapat kami proses. ";
    msg += "Mohon abaikan apabila sudah melakukan payment.\n\n";

    if (pcsShopee > 0) {
      msg += `\u{1F6D2} *Checkout di Shopee:* ${pcsShopee} pcs\n`;
      msg += `Link: https://s.shopee.co.id/8pjZ07JBJe\n`;
      msg += `\u{1F4DD} Cantumkan *nama* + *4 digit terakhir nomor HP* pada catatan pesanan.\n`;
      msg += `\u26A0\uFE0F Apabila menggunakan Shopee, kami tidak menanggung resiko apabila paket dinyatakan hilang oleh ekspedisi.\n\n`;
    }

    msg += "Terima kasih atas kepercayaannya. \u{1F64F}";

    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function sendPickupReminder(order: (typeof allOrders)[0]) {
    const customer = customers.find((c) => c.id === order.customer_id);
    const phone = customer?.phone || "";
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) {
      alert(`Nomor WA untuk ${order.customer_name || "pelanggan ini"} belum diisi.`);
      return;
    }
    const wa = cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned.startsWith("62") ? cleaned : "62" + cleaned;

    const items = itemsByOrder[order.id] || [];
    const productText = items.map((i) => `${i.product_name} x${i.quantity}`).join(", ");
    const sisa = order.total - order.paid_total;
    const isLunas = sisa <= 0;

    let msg = `Halo Kak ${order.customer_name || ""} \u{1F64F}\n\n`;
    msg += `Barang pesanan di *Jastip_mamanay* sudah *ready* dan bisa diambil ya!\n\n`;
    msg += `\u{1F4E6} Pesanan: ${productText}\n`;
    msg += `\u{1F4B0} Total: *Rp ${order.total.toLocaleString("id-ID")}*\n`;
    if (isLunas) {
      msg += `\u{2705} Lunas\n\n`;
    } else {
      msg += `Sisa bayar: *Rp ${sisa.toLocaleString("id-ID")}*\n\n`;
      msg += `\u{1F4B3} *Bayar QRIS:*\n`;
      msg += `${payOrderLink(order.id)}\n\n`;
      msg += `\u{1F3E6} Transfer BCA: ${BANK_INFO}\n\n`;
    }

    const pcsShopee = items.reduce((sum, i) => {
      const product = products.find((p) => p.id === i.product_id);
      const shopeePcs = product?.shopee_pcs || 1;
      return sum + Math.ceil((i.quantity * shopeePcs) / 1000);
    }, 0);

    msg += `Silakan mampir kapan saja ya Kak, atau kalau mau di-kirim juga bisa \u{1F60A}\n\n`;

    if (pcsShopee > 0) {
      msg += `\u{1F6D2} *Checkout di Shopee:* ${pcsShopee} pcs\n`;
      msg += `Link: https://s.shopee.co.id/8pjZ07JBJe\n`;
      msg += `\u{1F4DD} Cantumkan *nama* + *4 digit terakhir nomor HP* pada catatan pesanan.\n`;
      msg += `\u26A0\uFE0F Apabila menggunakan Shopee, kami tidak menanggung resiko apabila paket dinyatakan hilang oleh ekspedisi.\n\n`;
    }

    msg += `Terima kasih! \u{1F64F}`;

    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function sendShopeeMsg(order: (typeof allOrders)[0]) {
    const customer = customers.find((c) => c.id === order.customer_id);
    const phone = customer?.phone || "";
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) {
      alert(`Nomor WA untuk ${order.customer_name || "pelanggan ini"} belum diisi.`);
      return;
    }
    const wa = cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned.startsWith("62") ? cleaned : "62" + cleaned;

    const items = itemsByOrder[order.id] || [];
    const isReady = order.status === "ready";

    if (!isReady || items.length === 0) {
      alert("Belum ada barang yang statusnya ready.");
      return;
    }

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

    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function sendInvoiceWA(order: (typeof allOrders)[0]) {
    const customer = customers.find((c) => c.id === order.customer_id);
    const wa = toWaNumber(customer?.phone || "");
    if (!wa) {
      alert(`Nomor WA untuk ${order.customer_name || "pelanggan ini"} belum diisi.`);
      return;
    }
    const group: CustomerGroup = {
      customerId: order.customer_id || "none",
      name: order.customer_name || "Tanpa kontak",
      phone: customer?.phone || "",
      orders: [order],
    };
    const qrisLinks = await buildQrisLinks(group);
    window.open(
      `https://wa.me/${wa}?text=${encodeURIComponent(buildInvoiceMsg(group, qrisLinks))}`,
      "_blank"
    );
    await markInvoiceSent([order.id]);
  }

  const groupedCustomers = useMemo(() => {
    const map = new Map<string, CustomerGroup>();
    for (const order of filtered) {
      const key = order.customer_id || "none";
      const existing = map.get(key);
      if (!existing) {
        const cust = customers.find((c) => c.id === key);
        map.set(key, {
          customerId: key,
          name: order.customer_name || "Tanpa kontak",
          phone: cust?.phone || "",
          orders: [],
        });
      }
      map.get(key)!.orders.push(order);
    }
    return [...map.values()]
      .filter((g) => g.orders.some((o) => !isOrderLunas(o)))
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [filtered, customers]);

  function toWaNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) return "";
    return cleaned.startsWith("0")
      ? "62" + cleaned.slice(1)
      : cleaned.startsWith("62")
        ? cleaned
        : "62" + cleaned;
  }

  async function markInvoiceSent(orderIds: string[]) {
    const ids = orderIds.filter(Boolean);
    if (ids.length === 0) return;
    await supabase
      .from("orders")
      .update({ invoice_sent_at: new Date().toISOString() })
      .in("id", ids);
    await loadAllOrders();
  }

  async function buildQrisLinks(
    group: CustomerGroup
  ): Promise<{ order: Order; url: string }[] | { combined: true; url: string; orders: Order[] }[]> {
    const unpaid = group.orders.filter((o) => o.total - (o.paid_total || 0) > 0);
    if (unpaid.length > 1) {
      return [
        {
          combined: true,
          url: payGroupLink(unpaid.map((o) => o.id)),
          orders: unpaid,
        },
      ];
    }
    return unpaid.map((order) => ({ order, url: payOrderLink(order.id) }));
  }

  function buildInvoiceMsg(
    group: CustomerGroup,
    qrisLinks?: { order: Order; url: string }[] | { combined: true; url: string; orders: Order[] }[]
  ): string {
    const deadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const deadlineStr = deadline.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let msg = `Halo Kak ${group.name} \u{1F64F}\n\n`;
    msg += "Terima kasih sudah berbelanja di *Jastip_mamanay*.\n\n";
    msg += "Berikut kami kirimkan invoice untuk pesanan Kakak:\n\n";

    let grandTotal = 0;
    let grandPaid = 0;
    const unpaidOrders = group.orders.filter((o) => !isOrderLunas(o));
    const grouped: Record<string, Order[]> = {};
    const statusOrder = ["new", "belum-ready", "ready", "paid", "shipped", "delivered", "completed"];
    unpaidOrders.forEach((order) => {
      if (!grouped[order.status]) grouped[order.status] = [];
      grouped[order.status].push(order);
    });
    statusOrder.forEach((status) => {
      const list = grouped[status];
      if (!list) return;
      list.forEach((order) => {
        const items = itemsByOrder[order.id] || [];
        const productNames = items.map((i) => `${i.product_name} x${i.quantity}`).join(", ");
        const payMethod = PAYMENT_LABELS_FULL[order.payment_type] || order.payment_type;
        const statusLabel = STATUS_LABELS[order.status] || order.status;
        msg += `\u{1F4E6} Pesanan: ${productNames}\n`;
        msg += `Status barang: ${statusLabel}\n`;
        if (order.notes) msg += `\u{1F4DD} Catatan: ${order.notes}\n`;
        msg += `Metode: ${payMethod}\n`;
        msg += `\u{1F4B0} Total Tagihan: *Rp ${order.total.toLocaleString("id-ID")}*\n`;
        const paid = order.paid_total || 0;
        if (paid > 0) {
          msg += `Sudah dibayar: Rp ${paid.toLocaleString("id-ID")}\n`;
          msg += `Sisa: Rp ${(order.total - paid).toLocaleString("id-ID")}\n`;
        }
        msg += "\n";
        grandTotal += order.total;
        grandPaid += paid;
      });
    });

    if (unpaidOrders.length > 1) {
      msg += `\u{1F4CA} *Grand Total: Rp ${grandTotal.toLocaleString("id-ID")}*\n`;
      msg += `Total dibayar: Rp ${grandPaid.toLocaleString("id-ID")}\n`;
      msg += `*Sisa: Rp ${(grandTotal - grandPaid).toLocaleString("id-ID")}*\n\n`;
    }

    if (qrisLinks && qrisLinks.length > 0) {
      msg += `\u{1F4B3} *Bayar QRIS sekarang:*\n`;
      qrisLinks.forEach((link, idx) => {
        if (link.combined) {
          link.orders.forEach((order, i) => {
            const sisa = order.total - (order.paid_total || 0);
            const items = itemsByOrder[order.id] || [];
            const productNames = items.map((i) => `${i.product_name} x${i.quantity}`).join(", ");
            msg += `${i + 1}. ${productNames}\n`;
            msg += `\u{1F4B0} Sisa: *Rp ${sisa.toLocaleString("id-ID")}*\n\n`;
          });
          const totalSisa = link.orders.reduce((s, o) => s + (o.total - (o.paid_total || 0)), 0);
          msg += `\u{1F9FE} Total sisa: *Rp ${totalSisa.toLocaleString("id-ID")}* (${link.orders.length} pesanan digabung dalam 1 QRIS)\n`;
          msg += `Klik di sini untuk bayar pakai QRIS sekarang:\n${link.url}\n\n`;
          return;
        }
        const sisa = link.order.total - (link.order.paid_total || 0);
        const items = itemsByOrder[link.order.id] || [];
        const productNames = items.map((i) => `${i.product_name} x${i.quantity}`).join(", ");
        msg += `${idx + 1}. ${productNames}\n`;
        msg += `\u{1F4B0} Sisa: *Rp ${sisa.toLocaleString("id-ID")}*\n`;
        msg += `Klik di sini untuk bayar pakai QRIS sekarang:\n${link.url}\n\n`;
      });
    }

    msg += `\u{1F4B3} Metode Pembayaran: ${PAYMENT_LABELS_FULL[unpaidOrders[0]?.payment_type] || "Transfer Bank"}\n`;
    msg += BANK_INFO + "\n";
    msg += `\u{23F0} Batas Pembayaran: ${deadlineStr}\n\n`;

    msg += "Mohon melakukan pembayaran sebelum batas waktu yang ditentukan. ";
    msg += "Setelah transfer, silakan kirim bukti pembayaran agar pesanan dapat segera kami proses.\n";
    msg += "Mohon abaikan apabila sudah melakukan payment.\n\n";

    const pcsShopee = unpaidOrders.reduce((sum, order) => {
      const items = itemsByOrder[order.id] || [];
      return sum + items.reduce((s, i) => {
        const product = products.find((p) => p.id === i.product_id);
        const shopeePcs = product?.shopee_pcs || 1;
        return s + Math.ceil((i.quantity * shopeePcs) / 1000);
      }, 0);
    }, 0);
    if (pcsShopee > 0) {
      msg += `\u{1F6D2} *Untuk checkout di Shopee:* ${pcsShopee} pcs\n`;
      msg += `Link: https://s.shopee.co.id/8pjZ07JBJe\n`;
      msg += `📝 Cantumkan *nama* + *4 digit terakhir nomor HP* pada catatan pesanan.\n`;
      msg += `\u26A0\uFE0F Apabila menggunakan Shopee, kami tidak menanggung resiko apabila paket dinyatakan hilang oleh ekspedisi.\n\n`;
    }

    msg += "Terima kasih atas kepercayaannya. \u{1F64F}";
    return msg;
  }

  function openWaModal() {
    setSelectedCustomerIds(groupedCustomers.filter((g) => toWaNumber(g.phone)).map((g) => g.customerId));
    setWaModalOpen(true);
  }

  function toggleCustomer(id: string) {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function sendBulkInvoice() {
    const targets = groupedCustomers.filter((g) => selectedCustomerIds.includes(g.customerId));
    setWaModalOpen(false);
    setSendingInvoice(true);
    setSendProgress(`Mengirim ke ${targets.length} pelanggan...`);

    let sent = 0;
    let failed = 0;
    const failedNames: string[] = [];

    try {
      // Build invoices array
      const invoices = [];
      for (const g of targets) {
        const wa = toWaNumber(g.phone);
        if (!wa) {
          failed++;
          failedNames.push(g.name);
          continue;
        }
        const qrisLinks = await buildQrisLinks(g);
        const msg = buildInvoiceMsg(g, qrisLinks);
        invoices.push({ phone: wa, message: msg });
      }

      // Get bot API URL from Supabase
      const botUrl = await getBotApiUrl();

      // Send via bot API
      const res = await fetch(`${botUrl}/api/send-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${BOT_API_TOKEN}`,
        },
        body: JSON.stringify({ invoices }),
      });

      if (res.ok) {
        const result = await res.json();
        sent = result.sent || 0;
        failed = result.failed || 0;
      } else {
        // Fallback: open WA tabs if bot API unavailable
        setSendProgress("Bot tidak aktif, membuka WhatsApp...");
        let delay = 0;
        for (const g of targets) {
          const wa = toWaNumber(g.phone);
          if (!wa) continue;
          const qrisLinks = await buildQrisLinks(g);
          const msg = buildInvoiceMsg(g, qrisLinks);
          const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
          setTimeout(() => window.open(url, "_blank"), delay);
          delay += 400;
          sent++;
        }
      }
    } catch {
      // Fallback: open WA tabs
      setSendProgress("Bot tidak aktif, membuka WhatsApp...");
      let delay = 0;
      for (const g of targets) {
        const wa = toWaNumber(g.phone);
        if (!wa) continue;
        const qrisLinks = await buildQrisLinks(g);
        const msg = buildInvoiceMsg(g, qrisLinks);
        const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
        setTimeout(() => window.open(url, "_blank"), delay);
        delay += 400;
        sent++;
      }
    }

    const sentIds = targets.flatMap((g) => g.orders.filter((o) => !isOrderLunas(o)).map((o) => o.id));
    await markInvoiceSent(sentIds);
    setSendProgress(`Selesai: ${sent} terkirim${failed > 0 ? `, ${failed} gagal` : ""}`);
    setTimeout(() => {
      setSendingInvoice(false);
      setSendProgress("");
    }, 2000);
  }

  async function sendReadyReminders() {
    const readyOrders = filtered.filter((o) => o.status === "ready");
    if (readyOrders.length === 0) return;

    setSendingReminder(true);
    setSendProgress(`Mengirim pengingat ke ${readyOrders.length} order...`);

    // Group by customer
    const custMap = new Map<string, { customerId: string; name: string; phone: string; orders: typeof readyOrders }>();
    for (const order of readyOrders) {
      const key = order.customer_id || "none";
      const existing = custMap.get(key);
      if (existing) {
        existing.orders.push(order);
      } else {
        const cust = customers.find((c) => c.id === key);
        custMap.set(key, {
          customerId: key,
          name: order.customer_name || "Tanpa kontak",
          phone: cust?.phone || "",
          orders: [order],
        });
      }
    }

    const targets = [...custMap.values()];
    let sent = 0;
    let failed = 0;

    const invoices: { phone: string; message: string }[] = [];
    for (const g of targets) {
      const wa = toWaNumber(g.phone);
      if (!wa) { failed++; continue; }

      const lunas = g.orders.every((o) => isOrderLunas(o));
      const items = g.orders.flatMap((o) => itemsByOrder[o.id] || []);
      const productNames = items.map((i) => i.product_name).join(", ");
      const total = g.orders.reduce((s, o) => s + o.total, 0);
      const paid = g.orders.reduce((s, o) => s + (o.paid_total || 0), 0);
      const oldestReady = g.orders.reduce((earliest, o) => {
        const d = new Date(o.updated_at || o.created_at);
        return d < earliest ? d : earliest;
      }, new Date("2099-01-01"));
      const readyDate = oldestReady.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

      let msg = "";
      if (lunas) {
        // Ready + sudah lunas → pengingat ambil/kirim
        msg = `Halo Kak ${g.name} 🙏\n\n`;
        msg += `Pesanan *${productNames}* sudah ready dari ${readyDate}.\n\n`;
        msg += `Bisa diambil kapan saja ya Kak, atau kalau mau dikirim juga bisa 😊\n\n`;
        msg += `Terima kasih 🙏`;
      } else {
        // Ready + belum lunas → pengingat bayar
        const sisa = total - paid;
        msg = `Halo Kak ${g.name} 🙏\n\n`;
        msg += `Pesanan *${productNames}* sudah ready dari ${readyDate}.\n\n`;
        msg += `💰 Total: *Rp ${total.toLocaleString("id-ID")}*\n`;
        if (paid > 0) {
          msg += `Sudah dibayar: Rp ${paid.toLocaleString("id-ID")}\n`;
          msg += `Sisa: *Rp ${sisa.toLocaleString("id-ID")}*\n`;
        }
        msg += `\nMohon segera dilakukan pembayaran agar pesanan bisa segera diproses ya Kak.\n\n`;
        msg += `🏦 ${BANK_INFO}\n\n`;
        msg += `Terima kasih 🙏`;
      }
      invoices.push({ phone: wa, message: msg });
    }

    try {
      const botUrl = await getBotApiUrl();
      const res = await fetch(`${botUrl}/api/send-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${BOT_API_TOKEN}`,
        },
        body: JSON.stringify({ invoices }),
      });
      if (res.ok) {
        const result = await res.json();
        sent = result.sent || 0;
        failed = result.failed || 0;
      } else {
        // Fallback WA tabs
        let delay = 0;
        for (const inv of invoices) {
          setTimeout(() => window.open(`https://wa.me/${inv.phone}?text=${encodeURIComponent(inv.message)}`, "_blank"), delay);
          delay += 400;
          sent++;
        }
      }
    } catch {
      let delay = 0;
      for (const inv of invoices) {
        setTimeout(() => window.open(`https://wa.me/${inv.phone}?text=${encodeURIComponent(inv.message)}`, "_blank"), delay);
        delay += 400;
        sent++;
      }
    }

    setSendProgress(`Selesai: ${sent} terkirim${failed > 0 ? `, ${failed} gagal` : ""}`);
    setTimeout(() => {
      setSendingReminder(false);
      setSendProgress("");
    }, 2000);
  }

  async function openOneChat(group: CustomerGroup) {
    const wa = toWaNumber(group.phone);
    if (!wa) return;
    const qrisLinks = await buildQrisLinks(group);
    window.open(
      `https://wa.me/${wa}?text=${encodeURIComponent(buildInvoiceMsg(group, qrisLinks))}`,
      "_blank"
    );
    await markInvoiceSent(group.orders.map((o) => o.id));
  }

  async function copyInvoiceMsg(group: CustomerGroup) {
    const qrisLinks = await buildQrisLinks(group);
    navigator.clipboard.writeText(buildInvoiceMsg(group, qrisLinks)).then(() => {
      setCopiedId(group.customerId);
      setTimeout(() => setCopiedId((c) => (c === group.customerId ? null : c)), 1500);
    });
    await markInvoiceSent(group.orders.map((o) => o.id));
  }

  async function copyAllInvoiceMsgs() {
    const groups = groupedCustomers.filter((g) => selectedCustomerIds.includes(g.customerId));
    const parts: string[] = [];
    const sentIds: string[] = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const qrisLinks = await buildQrisLinks(g);
      parts.push(`${i + 1}. ${g.name}\n${buildInvoiceMsg(g, qrisLinks)}`);
      sentIds.push(...g.orders.map((o) => o.id));
    }
    navigator.clipboard.writeText(parts.join("\n\n------------------\n\n")).then(() => {
      setCopiedId("all");
      setTimeout(() => setCopiedId((c) => (c === "all" ? null : c)), 1500);
    });
    await markInvoiceSent(sentIds);
  }

  function getOrderAccentColor(order: Order): string {
    if (!isOrderLunas(order) && order.total > 0) return "border-rose-500";
    if (order.status === "ready") return "border-sky-500";
    if (order.status === "paid" || order.status === "shipped" || order.status === "delivered" || order.status === "completed") return "border-emerald-500";
    return "border-slate-200/80";
  }

  function getOrderAvatarBg(order: Order): string {
    if (!isOrderLunas(order) && order.total > 0) return "bg-rose-100 text-rose-600";
    if (order.status === "ready") return "bg-sky-100 text-sky-600";
    if (order.status === "paid" || order.status === "shipped" || order.status === "delivered" || order.status === "completed") return "bg-emerald-100 text-emerald-600";
    return "bg-slate-100 text-slate-600";
  }

  function getOrderStatusBadge(order: Order): { text: string; className: string } {
    if (!isOrderLunas(order) && order.total > 0) return { text: "Belum Bayar", className: "bg-rose-50 border-rose-200 text-rose-600" };
    if (order.status === "new") return { text: "Baru", className: "bg-blue-50 border-blue-200 text-blue-600" };
    if (order.status === "belum-ready") return { text: "Belum Ready", className: "bg-orange-50 border-orange-200 text-orange-600" };
    if (order.status === "ready") return { text: "READY SIAP AMBIL", className: "bg-sky-50 border-sky-200 text-sky-600" };
    if (order.status === "paid") return { text: "Dibayar", className: "bg-emerald-50 border-emerald-200 text-emerald-600" };
    if (order.status === "shipped") return { text: "Dikirim", className: "bg-amber-50 border-amber-200 text-amber-600" };
    if (order.status === "delivered") return { text: "Diterima", className: "bg-violet-50 border-violet-200 text-violet-600" };
    if (order.status === "completed") return { text: "Selesai", className: "bg-gray-50 border-gray-200 text-gray-500" };
    return { text: order.status, className: "bg-gray-50 border-gray-200 text-gray-500" };
  }

  function getTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Baru saja";
    if (mins < 60) return `${mins} menit yang lalu`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} jam yang lalu`;
    const days = Math.floor(hrs / 24);
    return `${days} hari yang lalu`;
  }

  function getInitial(name: string): string {
    return (name || "?").charAt(0).toUpperCase();
  }

  const countBelumBayar = baseFiltered.filter((o) => !isOrderLunas(o) && o.total > 0).length;
  const totalBelumBayar = baseFiltered.filter((o) => !isOrderLunas(o) && o.total > 0).reduce((s, o) => s + (o.total - o.paid_total), 0);
  const countReady = baseFiltered.filter((o) => o.status === "ready").length;
  const countLunas = baseFiltered.filter((o) => isOrderLunas(o)).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayPaidOrders = baseFiltered.filter((o) => isOrderLunas(o) && o.created_at?.slice(0, 10) === today);
  const todayLunasTotal = todayPaidOrders.reduce((s, o) => s + o.total, 0);
  const todayLunasCount = todayPaidOrders.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 sm:px-8 pt-4 pb-3 relative z-10 space-y-4">

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-pink-500 animate-pulse" />
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Daftar Pesanan</h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Kelola dan pantau semua transaksi jastip & penjualan</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative flex-1 sm:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowProductSuggest(e.target.value.length > 0);
                    if (productFilter) setProductFilter("");
                  }}
                  onFocus={() => setShowProductSuggest(search.length > 0)}
                  onBlur={() => setTimeout(() => setShowProductSuggest(false), 200)}
                  placeholder={productFilter || "Cari nama, produk, atau ID..."}
                  className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                />
                {productFilter && (
                  <button
                    onClick={() => setProductFilter("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-pink-100 hover:bg-pink-200 text-pink-500 rounded-lg transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {showProductSuggest && search && !productFilter && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                    {(() => {
                      const matched = allProductNames.filter((n) =>
                        n.toLowerCase().includes(search.toLowerCase())
                      );
                      return matched.length > 0 ? matched.slice(0, 8).map((name) => (
                        <button
                          key={name}
                          onMouseDown={() => {
                            setProductFilter(name);
                            setSearch("");
                            setShowProductSuggest(false);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-pink-50 text-left border-b border-slate-100 last:border-0"
                        >
                          <Package className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                          {name}
                        </button>
                      )) : (
                        <div className="px-4 py-3 text-sm text-slate-400">Produk tidak ditemukan</div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate("/orders/new")}
                className="px-3.5 py-2 bg-pink-500 hover:bg-pink-600 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-sm shadow-pink-500/20 transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-[0.97]"
              >
                + Order Baru
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <button
            onClick={() => navigate("/orders/bulk")}
            className="flex items-center justify-center gap-2 p-3 bg-white hover:bg-pink-50/50 border border-slate-200/80 hover:border-pink-300 rounded-2xl transition-all shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 font-bold flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Package className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-slate-800 leading-none">Order Massal</p>
              <p className="text-[10px] text-slate-400 mt-1">Multi-customer</p>
            </div>
            <span className="text-xs font-bold text-slate-700 sm:hidden">Order Massal</span>
          </button>
          <button
            onClick={() => navigate("/orders/upload")}
            className="flex items-center justify-center gap-2 p-3 bg-white hover:bg-purple-50/50 border border-slate-200/80 hover:border-purple-300 rounded-2xl transition-all shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 font-bold flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-slate-800 leading-none">Import CSV</p>
              <p className="text-[10px] text-slate-400 mt-1">Upload template</p>
            </div>
            <span className="text-xs font-bold text-slate-700 sm:hidden">Import CSV</span>
          </button>
          <button
            onClick={openWaModal}
            disabled={groupedCustomers.length === 0}
            className="flex items-center justify-center gap-2 p-3 bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-200/80 text-emerald-700 rounded-2xl transition-all shadow-sm group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white font-bold flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm shadow-emerald-500/20">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-emerald-900 leading-none">Invoice WA</p>
              <p className="text-[10px] text-emerald-600 mt-1">Kirim / salin teks</p>
            </div>
            <span className="text-xs font-bold text-emerald-800 sm:hidden">Invoice WA</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white p-2.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
            <div className="w-8 h-8 mx-auto bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 mb-1.5">
              <TrendingUp className="w-4 h-4" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase leading-none">Unpaid</p>
            <p className="text-sm sm:text-lg font-black text-rose-600 mt-0.5 leading-tight">Rp {totalBelumBayar < 1000 ? "0" : `${(totalBelumBayar / 1000).toFixed(0)}rb`}</p>
            <p className="text-[9px] sm:text-[10px] text-rose-400 font-semibold">{countBelumBayar} order</p>
          </div>
          <div className="bg-white p-2.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
            <div className="w-8 h-8 mx-auto bg-sky-50 rounded-xl flex items-center justify-center text-sky-500 mb-1.5">
              <PackageCheck className="w-4 h-4" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase leading-none">Ready</p>
            <p className="text-sm sm:text-lg font-black text-sky-600 mt-0.5 leading-tight">{countReady} Order</p>
            <p className="text-[9px] sm:text-[10px] text-sky-400 font-semibold">Siap ambil</p>
          </div>
          <div className="bg-white p-2.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
            <div className="w-8 h-8 mx-auto bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-1.5">
              <Check className="w-4 h-4" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase leading-none">Lunas</p>
            <p className="text-sm sm:text-lg font-black text-emerald-600 mt-0.5 leading-tight">Rp {todayLunasTotal < 1000 ? "0" : `${(todayLunasTotal / 1000).toFixed(0)}rb`}</p>
            <p className="text-[9px] sm:text-[10px] text-emerald-400 font-semibold">{todayLunasCount} trx</p>
          </div>
        </div>

        {productFilter && (
          <button
            type="button"
            onClick={() =>
              showConfirm(
                "Tandai Semua Ready?",
                `${readyTargets.length} order berisi "${productFilter}" akan diubah jadi READY.`,
                async () => {
                  const ids = readyTargets.map((o) => o.id);
                  if (ids.length === 0) return;
                  await supabase
                    .from("orders")
                    .update({ status: "ready", updated_at: new Date().toISOString() })
                    .in("id", ids);
                  await loadAllOrders();
                },
                "Tandai Ready"
              )
            }
            disabled={readyTargets.length === 0}
            className="w-full px-3 py-2.5 bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-600 rounded-xl font-medium text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            Tandai Semua Ready ({readyTargets.length}) — {productFilter}
          </button>
        )}

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setTab("all")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 ${
              tab === "all"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold flex items-center gap-1.5"
            }`}
          >
            Semua ({countTab("all")})
          </button>
          <button
            onClick={() => setTab("belum-lunas")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 ${
              tab === "belum-lunas"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Belum Bayar
            <span className="bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded-full text-[10px]">{countBelumBayar}</span>
          </button>
          <button
            onClick={() => setTab("ready")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 ${
              tab === "ready"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            Ready
            <span className="bg-sky-100 text-sky-700 font-bold px-1.5 py-0.5 rounded-full text-[10px]">{countReady}</span>
          </button>
          <button
            onClick={() => setTab("lunas")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 ${
              tab === "lunas"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Selesai / Lunas
            <span className="bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full text-[10px]">{countLunas}</span>
          </button>
          <button
            onClick={() => setTab("belum-dikirim")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 ${
              tab === "belum-dikirim"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold"
            }`}
          >
            Belum Dikirim ({countBelumDikirim})
          </button>
          <button
            onClick={() => setTab("pembelian")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 ${
              tab === "pembelian"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold"
            }`}
          >
            Pembelian ({countPembelian})
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4 relative z-10">
        {tab === "belum-lunas" && filtered.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-widest">Total Piutang</p>
              <p className="text-lg font-bold text-amber-700">Rp {totalPiutang.toLocaleString("id-ID")}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-widest">Belum Dibayar</p>
              <p className="text-lg font-bold text-amber-700">{filtered.length} order</p>
            </div>
          </div>
        )}
        {tab === "belum-diambil" && filtered.length > 0 && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-xs text-teal-600 font-semibold uppercase tracking-widest">Barang Sudah Dibayar</p>
              <p className="text-lg font-bold text-teal-700">Rp {totalBelumDiambil.toLocaleString("id-ID")}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-teal-600 font-semibold uppercase tracking-widest">Menunggu Diambil</p>
              <p className="text-lg font-bold text-teal-700">{filtered.length} order</p>
            </div>
          </div>
        )}
        {tab === "ready" && filtered.length > 0 && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-xs text-sky-600 font-semibold uppercase tracking-widest">Ready</p>
              <p className="text-lg font-bold text-sky-700">{filtered.length} order siap</p>
            </div>
            <button
              onClick={sendReadyReminders}
              disabled={sendingReminder}
              className="px-4 py-2 bg-sky-500 text-white text-sm font-bold rounded-xl hover:bg-sky-600 transition-all disabled:opacity-50"
            >
              {sendingReminder ? sendProgress || "Mengirim..." : "Kirim Pengingat"}
            </button>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-5">
              <ClipboardList className="w-8 h-8 text-pink-300" />
            </div>
            <p className="text-slate-500 text-xl font-medium">
              {tab === "all"
                ? "Belum ada order"
                : tab === "lunas"
                  ? "Belum ada order lunas"
                  : tab === "ready"
                    ? "Tidak ada order yang ready"
                    : tab === "belum-diambil"
                      ? "Tidak ada barang yang menunggu diambil"
                      : "Belum ada data"}
            </p>
            <p className="text-slate-300 text-base mt-1">
              Tap "+ Order Baru" untuk membuat order
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sortedOrders.map((order) => {
              const badge = getOrderStatusBadge(order);
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl border shadow-sm p-3.5 hover:shadow-md transition-all relative overflow-hidden cursor-pointer group ${getOrderAccentColor(order)}`}
                  onClick={() => navigate(`/orders/${order.id}`, { state: { returnTo: `/orders?${searchParams.toString()}` } })}
                >
                  {!isOrderLunas(order) && order.total > 0 && (
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                  )}

                  <div className="flex items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${getOrderAvatarBg(order)}`}>
                        {getInitial(order.customer_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-sm">{order.customer_name || "Tanpa kontak"}</h3>
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={order.status}
                              onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                              disabled={updatingStatus === order.id}
                              className={`text-[10px] px-1.5 py-0.5 font-bold rounded-full border appearance-none cursor-pointer pr-4 bg-no-repeat bg-[length:10px] bg-[right_4px_center] ${badge.className} disabled:opacity-50`}
                              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")` }}
                            >
                              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          #{order.id.slice(0, 8).toUpperCase()} · {getTimeAgo(order.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-base font-black ${!isOrderLunas(order) && order.total > 0 ? "text-rose-600" : "text-slate-900"}`}>
                        Rp {order.total.toLocaleString("id-ID")}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2.5 flex items-center justify-between gap-2">
                    <div className="text-slate-600 font-medium flex items-center gap-1.5 min-w-0 text-[11px]">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold shrink-0">
                        {itemsByOrder[order.id]?.length || 0} Barang
                      </span>
                      <span className="truncate">
                        {itemsByOrder[order.id]?.map((i) => `${i.product_name} x${i.quantity}`).join(", ") || "Loading..."}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isOrderLunas(order) && order.total > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sendInvoiceWA(order);
                            }}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white font-bold rounded-lg text-[10px] transition-all shadow-sm"
                          >
                            QRIS
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sendReminder(order);
                            }}
                            className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-lg text-[10px] transition-all shadow-sm shadow-rose-500/20"
                          >
                            Lunas
                          </button>
                        </>
                      )}
                      {(isOrderLunas(order) || order.total === 0) && (
                        <>
                          {order.status === "ready" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sendShopeeMsg(order);
                            }}
                            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg text-[10px] transition-all shadow-sm shadow-orange-500/20"
                          >
                            Shopee
                          </button>
                          )}
                          {tab === "belum-diambil" && (
                            <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                sendPickupReminder(order);
                              }}
                              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg text-[10px] transition-all shadow-sm shadow-blue-500/20"
                            >
                              Ingatkan
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                showConfirm(
                                  "Tandai Diambil?",
                                  `Tandai pesanan ${order.customer_name || "ini"} sebagai sudah diambil?`,
                                  async () => {
                                    await supabase
                                      .from("orders")
                                      .update({ status: "completed", updated_at: new Date().toISOString() })
                                      .eq("id", order.id);
                                    await loadAllOrders();
                                  },
                                  "Tandai Diambil"
                                );
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition-all shadow-sm shadow-emerald-600/20"
                            >
                              Diambil
                            </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/orders/${order.id}`, { state: { returnTo: `/orders?${searchParams.toString()}` } });
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] transition-all"
                          >
                            Detail
                          </button>
                        </>
                      )}
                      {!isOrderLunas(order) && order.total > 0 && (
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
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg transition-all border border-red-100"
                            title="Hapus Order"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {waModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setWaModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3 z-10 max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <p className="text-sm font-bold text-gray-800">Kirim Invoice Massal</p>
              <button
                onClick={() => setWaModalOpen(false)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed shrink-0">
              Pilih pelanggan, lalu klik "Kirim" untuk mengirim invoice via bot WhatsApp.
            </p>
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2 -mx-5 px-5">
              {groupedCustomers.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-400">
                  Tidak ada pelanggan yang perlu ditagih di filter ini.
                </div>
              )}
              {groupedCustomers.map((g) => {
                const hasPhone = !!toWaNumber(g.phone);
                const checked = selectedCustomerIds.includes(g.customerId);
                const total = g.orders.reduce((s, o) => s + o.total, 0);
                const paid = g.orders.reduce((s, o) => s + (o.paid_total || 0), 0);
                return (
                  <label
                    key={g.customerId}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                      checked ? "bg-green-50 border-green-200" : "bg-white border-gray-100"
                    } ${hasPhone ? "" : "opacity-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!hasPhone}
                      onChange={() => toggleCustomer(g.customerId)}
                      className="w-4 h-4 accent-green-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-800 truncate">{g.name}</span>
                        {!hasPhone && (
                          <span className="text-[10px] text-red-400 font-semibold shrink-0">tanpa WA</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {g.orders.length} order · Rp {total.toLocaleString("id-ID")}
                        {total - paid > 0 && (
                          <span className="text-amber-500 font-semibold">
                            {" · sisa "}
                            Rp {(total - paid).toLocaleString("id-ID")}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPreviewLoading(true);
                          setPreviewQris(undefined);
                          setPreviewGroup(g);
                          setPreviewQris(await buildQrisLinks(g));
                          setPreviewLoading(false);
                        }}
                        className="p-2 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg transition-all"
                        title="Lihat teks invoice"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openOneChat(g);
                        }}
                        disabled={!hasPhone}
                        className="p-2 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg transition-all disabled:opacity-40"
                        title="Buka chat WA"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          copyInvoiceMsg(g);
                        }}
                        disabled={!hasPhone}
                        className={`p-2 rounded-lg transition-all disabled:opacity-40 ${
                          copiedId === g.customerId
                            ? "bg-emerald-500 text-white"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                        }`}
                        title={copiedId === g.customerId ? "Tersalin" : "Salin teks invoice"}
                      >
                        {copiedId === g.customerId ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 shrink-0">
              <span className="text-xs text-gray-400">{selectedCustomerIds.length} dipilih</span>
              <div className="flex gap-1.5">
                <button
                  onClick={copyAllInvoiceMsgs}
                  disabled={selectedCustomerIds.length === 0}
                  className="px-3 py-2 text-xs font-semibold text-green-600 hover:bg-green-50 rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5"
                >
                  {copiedId === "all" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  Salin Semua
                </button>
                <button
                  onClick={() => setWaModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={sendBulkInvoice}
                  disabled={selectedCustomerIds.length === 0 || sendingInvoice}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 text-white disabled:text-gray-400 rounded-xl text-sm font-semibold transition-all"
                >
                  {sendingInvoice ? sendProgress || "Mengirim..." : `Kirim ke ${selectedCustomerIds.length} Pelanggan`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewGroup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPreviewGroup(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3 z-10 max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <p className="text-sm font-bold text-gray-800">Pratinjau Invoice — {previewGroup.name}</p>
              <button
                onClick={() => setPreviewGroup(null)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 bg-gray-50 rounded-xl p-4 whitespace-pre-wrap text-xs text-gray-700 leading-relaxed">
              {previewLoading ? (
                <div className="text-center py-6 text-gray-400">
                  Membuat link QRIS...
                </div>
              ) : (
                buildInvoiceMsg(previewGroup, previewQris)
              )}
            </div>
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(buildInvoiceMsg(previewGroup, previewQris))
                  .then(() => {
                    setCopiedId(previewGroup.customerId);
                    setTimeout(() => setCopiedId((c) => (c === previewGroup.customerId ? null : c)), 1500);
                  });
              }}
              className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              disabled={previewLoading}
            >
              {copiedId === previewGroup.customerId ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {copiedId === previewGroup.customerId ? "Tersalin" : "Salin Teks"}
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        visible={confirmVisible}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmLabel}
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
