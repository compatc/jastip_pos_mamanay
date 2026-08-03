import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import { payOrderLink, payGroupLink } from "../lib/payLinks";
import type { Order, PaymentType } from "../types";
import ConfirmationModal from "../components/ConfirmationModal";
import {
  Search,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Trash2,
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

type TabFilter = "all" | "penjualan" | "pembelian" | "belum-dikirim" | "belum-lunas" | "belum-diambil";

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

type CustomerGroup = {
  customerId: string;
  name: string;
  phone: string;
  orders: Order[];
};

export default function Orders() {
  const { allOrders, loadAllOrders, deleteOrder, customers, loadCustomers } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [tab, setTab] = useState<TabFilter>((searchParams.get("tab") as TabFilter) || "all");
  const [productFilter, setProductFilter] = useState(searchParams.get("product") || "");
  const [showProductSuggest, setShowProductSuggest] = useState(false);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, { product_name: string; quantity: number }[]>>({});

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
        .select("order_id, product_name, quantity")
        .in("order_id", ids);
      const map: Record<string, { product_name: string; quantity: number }[]> = {};
      if (data) {
        for (const row of data) {
          if (!map[row.order_id]) map[row.order_id] = [];
          map[row.order_id].push({ product_name: row.product_name, quantity: row.quantity });
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
      (tabFilter === "belum-dikirim" &&
        o.status !== "shipped" &&
        o.status !== "delivered" &&
        o.status !== "completed") ||
      (tabFilter === "belum-lunas" && !isOrderLunas(o)) ||
      (tabFilter === "belum-diambil" &&
        o.order_type === "penjualan" &&
        isOrderLunas(o) &&
        ["new", "belum-ready", "ready", "paid"].includes(o.status))
    );
  }

  const filtered = allOrders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      (itemsByOrder[o.id] || []).some((i) => i.product_name.toLowerCase().includes(q));
    const matchProduct =
      !productFilter ||
      (itemsByOrder[o.id] || []).some((i) => i.product_name === productFilter);
    return matchTabFilter(o, tab) && matchSearch && matchProduct;
  });

  function countTab(tabFilter: string): number {
    return allOrders.filter((o) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (itemsByOrder[o.id] || []).some((i) => i.product_name.toLowerCase().includes(q));
      const matchProduct =
        !productFilter ||
        (itemsByOrder[o.id] || []).some((i) => i.product_name === productFilter);
      return matchTabFilter(o, tabFilter) && matchSearch && matchProduct;
    }).length;
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

    if (sisa > 0) {
      msg += `\u{1F4B3} *Bayar QRIS sekarang:*\n`;
      msg += `Klik di sini untuk bayar pakai QRIS:\n${payOrderLink(order.id)}\n\n`;
      msg += `\u{1F3E6} *Transfer Bank BCA:*\n`;
      msg += `${BANK_INFO}\n\n`;
    }

    msg += "Mohon segera konfirmasi pembayaran agar pesanan dapat kami proses. ";
    msg += "Mohon abaikan apabila sudah melakukan payment.\n\n";
    msg += "Terima kasih atas kepercayaannya. \u{1F64F}";

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
    const grouped: Record<string, Order[]> = {};
    const statusOrder = ["new", "belum-ready", "ready", "paid", "shipped", "delivered", "completed"];
    group.orders.forEach((order) => {
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

    if (group.orders.length > 1) {
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

    msg += `\u{1F4B3} Metode Pembayaran: ${PAYMENT_LABELS_FULL[group.orders[0]?.payment_type] || "Transfer Bank"}\n`;
    msg += BANK_INFO + "\n";
    msg += `\u{23F0} Batas Pembayaran: ${deadlineStr}\n\n`;

    msg += "Mohon melakukan pembayaran sebelum batas waktu yang ditentukan. ";
    msg += "Setelah transfer, silakan kirim bukti pembayaran agar pesanan dapat segera kami proses.\n";
    msg += "Mohon abaikan apabila sudah melakukan payment.\n\n";
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
    let delay = 0;
    const sentIds: string[] = [];
    for (const g of targets) {
      const wa = toWaNumber(g.phone);
      if (!wa) continue;
      const qrisLinks = await buildQrisLinks(g);
      const msg = buildInvoiceMsg(g, qrisLinks);
      const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
      setTimeout(() => window.open(url, "_blank"), delay);
      delay += 400;
      sentIds.push(...g.orders.map((o) => o.id));
    }
    setWaModalOpen(false);
    await markInvoiceSent(sentIds);
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-4 pb-3 relative z-10">
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (productFilter) setProductFilter("");
                }}
                onFocus={() => setShowProductSuggest(search.length > 0)}
                onBlur={() => setTimeout(() => setShowProductSuggest(false), 200)}
                placeholder={productFilter || "Cari order atau produk..."}
                className="w-full pl-10 pr-10 py-3 bg-white/80 border border-pink-100 rounded-xl text-gray-700 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
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
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-pink-100 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
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
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-pink-50 text-left border-b border-pink-50 last:border-0"
                      >
                        <Package className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                        {name}
                      </button>
                    )) : (
                      <div className="px-4 py-3 text-sm text-gray-400">Produk tidak ditemukan</div>
                    );
                  })()}
                </div>
              )}
            </div>
          <button
            onClick={() => navigate("/orders/new")}
            className="w-28 px-4 py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl font-medium text-base flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-pink-200/40 shrink-0 active:scale-[0.97]"
          >
            <ClipboardList className="w-4 h-4" />
            Baru
          </button>
        </div>

        {productFilter && (
          <button
            type="button"
            onClick={() =>
              showConfirm(
                "Tandai Semua Ready?",
                `${readyTargets.length} order berisi "${productFilter}" akan diubah jadi READY (khusus status Baru / Belum Ready).`,
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
            className="w-full mb-3 px-3 py-2.5 bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-600 rounded-xl font-medium text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            Tandai Semua Ready ({readyTargets.length}) — {productFilter}
          </button>
        )}

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => navigate("/orders/bulk")}
            className="flex-1 px-3 py-2.5 bg-white/80 border border-pink-100 hover:bg-pink-50 text-gray-600 rounded-xl font-medium text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
          >
            <Package className="w-4 h-4" />
            Massal
          </button>
          <button
            onClick={() => navigate("/orders/upload")}
            className="flex-1 px-3 py-2.5 bg-white/80 border border-pink-100 hover:bg-pink-50 text-gray-600 rounded-xl font-medium text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={openWaModal}
            disabled={groupedCustomers.length === 0}
            className="flex-1 px-3 py-2.5 bg-green-50 border border-green-200 hover:bg-green-100 text-green-600 rounded-xl font-medium text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MessageCircle className="w-4 h-4" />
            Invoice
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
            Semua ({countTab("all")})
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
          <button
            onClick={() => setTab("belum-diambil")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
              tab === "belum-diambil"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            <PackageCheck className="w-3 h-3" />
            Belum Diambil ({countBelumDiambil})
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-5 pb-4 relative z-10">
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
                  : tab === "belum-diambil"
                    ? "Tidak ada barang yang menunggu diambil"
                    : "Belum ada pembelian"}
            </p>
            <p className="text-gray-300 text-base mt-1">
              Tap "Baru" untuk membuat order
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white/80 hover:bg-white border border-pink-100/60 rounded-2xl p-4 flex items-center justify-between transition-all shadow-sm shadow-pink-50 cursor-pointer"
                onClick={() => navigate(`/orders/${order.id}`, { state: { returnTo: `/orders?${searchParams.toString()}` } })}
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
                    {itemsByOrder[order.id] && itemsByOrder[order.id].length > 0 && (
                      <p className="text-gray-400 text-sm truncate mt-0.5">
                        {itemsByOrder[order.id].map((i) => `${i.product_name}×${i.quantity}`).join(", ")}
                      </p>
                    )}
                    {order.resi && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {COURIER_LABELS[order.courier || ""] || "Kurir"} · Resi: {order.resi}
                      </p>
                    )}
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
                      {tab === "belum-lunas" && (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${getAgeBadge(getAgeDays(order.created_at))}`}>
                          {getAgeDays(order.created_at) === 0
                            ? "Hari ini"
                            : `Hari ke-${getAgeDays(order.created_at)}`}
                        </span>
                      )}
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
                    {!isOrderLunas(order) && order.total > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sendReminder(order);
                          }}
                          className="p-2.5 bg-amber-50 hover:bg-amber-100 text-amber-500 rounded-xl transition-all border border-amber-200 shrink-0"
                          title="Kirim Pengingat WA"
                        >
                          <BellRing className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sendInvoiceWA(order);
                          }}
                          className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl transition-all border border-emerald-200 shrink-0"
                          title="Kirim Tagihan via WA"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {tab === "belum-diambil" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          showConfirm(
                            "Tandai Diambil?",
                            `Tandai pesanan ${order.customer_name || "ini"} sebagai sudah diambil? Order akan keluar dari daftar "Belum Diambil".`,
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
                        className="p-2.5 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded-xl transition-all border border-teal-200 shrink-0"
                        title="Tandai Sudah Diambil"
                      >
                        <PackageCheck className="w-4 h-4" />
                      </button>
                    )}
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
              Pilih pelanggan, lalu buka chat satu per satu (paling aman) atau salin teks invoice
              untuk ditempel. Pelanggan yang sudah lunas otomatis dilewati.
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
                  disabled={selectedCustomerIds.length === 0}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 text-white disabled:text-gray-400 rounded-xl text-sm font-semibold transition-all"
                >
                  Buka Semua
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
