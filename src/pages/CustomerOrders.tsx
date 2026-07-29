import { Fragment, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import ConfirmationModal from "../components/ConfirmationModal";
import html2canvas from "html2canvas";
import {
  ArrowLeft,
  Plus,
  Package,
  Trash2,
  Download,
  FileImage,
  MessageCircle,
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

function getOrderStatusColor(order: any): string {
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

interface OrderItemData {
  product_name: string;
  quantity: number;
  price: number;
  discount: number;
}

interface OrderWithItems {
  order: any;
  items: OrderItemData[];
}

export default function CustomerOrders() {
  const { customerId } = useParams<{ customerId: string }>();
  const {
    orders,
    loadOrders,
    customers,
    loadCustomers,
    deleteOrder,
  } = useStore();
  const navigate = useNavigate();
  const exportRef = useRef<HTMLDivElement>(null);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmOnConfirm, setConfirmOnConfirm] = useState<(() => void) | null>(null);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemData[]>>({});
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFilter, setExportFilter] = useState<"all" | "uncompleted">("all");
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  function toggleSelectOrder(id: string) {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
        .select("order_id, product_name, quantity, price, discount")
        .in("order_id", ids);
      if (!data) return;
      const map: Record<string, OrderItemData[]> = {};
      for (const row of data) {
        if (!map[row.order_id]) map[row.order_id] = [];
        map[row.order_id].push({ product_name: row.product_name, quantity: row.quantity, price: row.price, discount: row.discount || 0 });
      }
      setItemsByOrder(map);
    }
    loadAllItems();
  }, [orders]);

  const customer = customers.find((c) => c.id === customerId);

  function getFilteredOrders(filter: "all" | "uncompleted"): OrderWithItems[] {
    const list = filter === "all" ? orders : orders.filter((o) => o.paid_total < o.total && o.total > 0);
    return list.map((order) => ({ order, items: itemsByOrder[order.id] || [] }));
  }

  async function exportAs(filter: "all" | "uncompleted") {
    setExportMenuOpen(false);
    setExportFilter(filter);

    await new Promise((r) => setTimeout(r, 100));

    setExporting(true);

    const el = exportRef.current;
    if (!el) { setExporting(false); return; }

    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 300)));

    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `transaksi-${customer?.name || "pelanggan"}-${filter}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    }
    setExporting(false);
  }

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
    const statusOrder = ["new", "belum-ready", "ready", "paid", "shipped", "delivered", "completed"];
    selected.forEach((order) => {
      const key = order.status;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    });
    statusOrder.forEach((status) => {
      const list = grouped[status];
      if (!list) return;
      list.forEach((order) => {
        const items = itemsByOrder[order.id] || [];
        const productNames = items.map((i) => i.product_name).join(", ");
        const payMethod = paymentLabels[order.payment_type] || order.payment_type;
        msg += `\u{1F4E6} Pesanan: ${productNames}\n`;
        msg += `\u{1F4B0} Total Tagihan: *${rupiah(order.total)}*\n`;
        const paid = order.paid_total || 0;
        if (paid > 0) {
          msg += `Sudah dibayar: ${rupiah(paid)}\n`;
          msg += `Sisa: ${rupiah(order.total - paid)}\n`;
        }
        msg += `\u{1F4B3} Metode Pembayaran: ${payMethod}\n`;
        msg += `\u{23F0} Batas Pembayaran: ${deadlineStr}\n\n`;
        grandTotal += order.total;
        grandPaid += paid;
      });
    });

    if (selected.length > 1) {
      msg += `\u{1F4CA} *Grand Total: ${rupiah(grandTotal)}*\n`;
      msg += `Total dibayar: ${rupiah(grandPaid)}\n`;
      msg += `*Sisa: ${rupiah(grandTotal - grandPaid)}*\n\n`;
    }

    msg += "Mohon melakukan pembayaran sebelum batas waktu yang ditentukan. ";
    msg += "Setelah transfer, silakan kirim bukti pembayaran agar pesanan dapat segera kami proses.\n\n";
    msg += "Terima kasih atas kepercayaannya. \u{1F64F}";

    const cleaned = phone.replace(/\D/g, "");
    const wa = cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned.startsWith("62") ? cleaned : "62" + cleaned;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="h-full flex flex-col relative z-10">

      <main className="flex-1 px-5 py-4 max-w-7xl w-full mx-auto overflow-y-auto">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => navigate("/")}
                className="p-2.5 bg-white hover:bg-pink-50 rounded-xl transition-all border border-pink-100 shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-800 truncate">
                  {customer?.name || "Pelanggan"}
                </h2>
                <p className="text-sm text-gray-400">
                  {orders.length} transaksi
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setExportMenuOpen(true)}
                disabled={exporting || orders.length === 0}
                className="p-2.5 bg-white border border-pink-200 hover:bg-pink-50 text-gray-600 rounded-xl transition-all disabled:opacity-40"
                title="Export"
              >
                {exporting ? (
                  <div className="w-5 h-5 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() =>
                  navigate("/orders/new", {
                    state: {
                      contactName: customer?.name,
                      returnTo: `/customer/${customerId}`,
                    },
                  })
                }
                className="px-4 py-2.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl font-medium text-sm flex items-center gap-1.5 transition-all shadow-lg shadow-pink-200/40 active:scale-[0.97]"
              >
                <Plus className="w-4 h-4" />
                Order
              </button>
            </div>
          </div>
        </div>

        {(() => {
          const belumLunas = orders.filter((o) => o.paid_total < o.total && o.total > 0);
          const grandTotal = belumLunas.reduce((sum, o) => sum + o.total, 0);
          const totalPaid = belumLunas.reduce((sum, o) => sum + (o.paid_total || 0), 0);
          const sisa = grandTotal - totalPaid;
          if (belumLunas.length === 0) return null;
          return (
            <div className="mb-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-500 uppercase tracking-wide">Belum Lunas</span>
                <span className="text-xs font-semibold text-amber-500">{belumLunas.length} transaksi</span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-lg font-bold text-amber-700">{rupiah(sisa)}</span>
                  <span className="text-xs text-amber-400 ml-2">sisa tagihan</span>
                </div>
                <span className="text-xs text-amber-500/60">
                  Total: {rupiah(grandTotal)}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); openWaModal(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
              >
                <MessageCircle className="w-4 h-4" />
                Kirim Tagihan via WA
              </button>
            </div>
          );
        })()}

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-5">
              <Package className="w-8 h-8 text-pink-300" />
            </div>
            <p className="text-gray-500 text-xl font-medium">
              Belum ada transaksi
            </p>
            <p className="text-gray-300 text-base mt-1">
              Tap "Order" untuk membuat baru
            </p>
          </div>
        ) : (
          <div className="space-y-3">
                  {orders.map((order) => {
                    const items = itemsByOrder[order.id] || [];
                    return (
                      <div
                        key={order.id}
                        onClick={() =>
                          navigate(`/orders/${order.id}/edit`, {
                            state: { returnTo: `/customer/${customerId}` },
                          })
                        }
                        className="bg-white/90 border border-pink-100/80 rounded-2xl shadow-sm p-4 hover:bg-pink-50/40 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block px-2 sm:px-2.5 py-0.5 sm:py-1 rounded text-xs sm:text-sm font-semibold border ${getOrderStatusColor(
                                order
                              )}`}
                            >
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                            {order.paid_total >= order.total && order.total > 0 && (
                              <span className="inline-block px-2 sm:px-2.5 py-0.5 sm:py-1 rounded text-xs sm:text-sm font-semibold border bg-emerald-50 text-emerald-500 border-emerald-100">
                                LUNAS
                              </span>
                            )}
                            <span className="text-gray-500 text-sm">
                              {new Date(order.created_at).toLocaleDateString(
                                "id-ID",
                                { day: "numeric", month: "short", year: "numeric" }
                              )}
                            </span>
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
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all border border-red-100"
                            title="Hapus Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {items.length > 0 && (
                          <div className="mt-2 text-base">
                            <div className="grid grid-cols-[6fr_1fr_3fr] gap-1 text-gray-400 text-sm uppercase tracking-wider font-semibold mb-1">
                              <span>Item</span>
                              <span className="text-center">Qty</span>
                              <span className="text-right">Subtotal</span>
                            </div>
                            <div className="grid grid-cols-[6fr_1fr_3fr] gap-1 text-gray-600">
                              {items.map((item, idx) => (
                                <Fragment key={idx}>
                                  <span className="truncate">{item.product_name}</span>
                                  <span className="text-center">{item.quantity}</span>
                                  <span className="text-right">{rupiah(item.price * item.quantity - item.discount)}</span>
                                </Fragment>
                              ))}
                            </div>
                            {(() => {
                              const totalDiscount = items.reduce((s, i) => s + i.discount, 0);
                              const ongkir = order.ongkir || 0;
                              return (
                                <>
                                  {totalDiscount > 0 && (
                                    <div className="flex justify-between text-gray-400 mt-1 text-base">
                                      <span>Diskon</span>
                                      <span>-{rupiah(totalDiscount)}</span>
                                    </div>
                                  )}
                                  {ongkir > 0 && (
                                    <div className="flex justify-between text-gray-400 mt-1 text-base">
                                      <span>Ongkir</span>
                                      <span>{rupiah(ongkir)}</span>
                                    </div>
                                  )}
                                  {(order.diskon || 0) > 0 && (
                                    <div className="flex justify-between text-gray-400 mt-1 text-base">
                                      <span>Diskon</span>
                                      <span>-{rupiah(order.diskon)}</span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                        <div className="mt-2 pt-2 border-t border-pink-100/40 flex justify-between text-base font-bold text-gray-800">
                          <span>Total</span>
                          <span>{rupiah(order.total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
        )}
      </main>

      {/* Hidden export target */}
      <div
        ref={exportRef}
        className="fixed bg-white p-6"
        style={{
          width: "380px",
          visibility: exporting ? "visible" : "hidden",
          top: exporting ? 0 : -9999,
          left: 0,
        }}
      >
        <div style={{ fontFamily: "sans-serif" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "6px", color: "#1f2937" }}>
            {customer?.name || "Pelanggan"}
          </h2>
          <p style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "16px", whiteSpace: "nowrap" }}>
            {customer?.phone || ""} · {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          {getFilteredOrders(exportFilter).length === 0 && (
            <p style={{ fontSize: "14px", color: "#9ca3af" }}>Tidak ada transaksi</p>
          )}
          {getFilteredOrders(exportFilter).map(({ order, items }) => {
            const totalDiscount = items.reduce((s, i) => s + i.discount, 0);
            const ongkir = order.ongkir || 0;
            const isLunas = order.paid_total >= order.total && order.total > 0;
            return (
              <div key={order.id} style={{ marginBottom: "16px", padding: "14px", border: "1px solid #fce7f3", borderRadius: "12px" }}>
                <div style={{ marginBottom: "8px", whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", lineHeight: "18px", fontWeight: 600, border: "1px solid #fce7f3", backgroundColor: "#fefce8", color: "#ca8a04", verticalAlign: "middle", marginRight: "6px" }}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                  {isLunas && (
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", lineHeight: "18px", fontWeight: 600, border: "1px solid #d1fae5", backgroundColor: "#ecfdf5", color: "#10b981", verticalAlign: "middle", marginRight: "6px" }}>
                      LUNAS
                    </span>
                  )}
                  <span style={{ display: "inline-block", fontSize: "13px", color: "#6b7280", lineHeight: "18px", verticalAlign: "middle" }}>
                    {new Date(order.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                {items.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "6fr 1fr 3fr", gap: "4px", fontSize: "11px", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                      <span>Item</span>
                      <span style={{ textAlign: "center" }}>Qty</span>
                      <span style={{ textAlign: "right" }}>Subtotal</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "6fr 1fr 3fr", gap: "4px", fontSize: "13px", color: "#4b5563" }}>
                      {items.map((item, idx) => (
                        <Fragment key={idx}>
                          <span>{item.product_name}</span>
                          <span style={{ textAlign: "center" }}>{item.quantity}</span>
                          <span style={{ textAlign: "right" }}>{rupiah(item.price * item.quantity - item.discount)}</span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                )}
                {totalDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#9ca3af", marginBottom: "2px" }}>
                    <span>Diskon</span><span>-{rupiah(totalDiscount)}</span>
                  </div>
                )}
                {ongkir > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#9ca3af", marginBottom: "2px" }}>
                    <span>Ongkir</span><span>{rupiah(ongkir)}</span>
                  </div>
                )}
                {(order.diskon || 0) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#9ca3af", marginBottom: "2px" }}>
                    <span>Diskon</span><span>-{rupiah(order.diskon)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "bold", color: "#1f2937", borderTop: "1px solid #fce7f3", paddingTop: "8px", marginTop: "8px" }}>
                  <span>Total</span><span>{rupiah(order.total)}</span>
                </div>
              </div>
            );
          })}
          {getFilteredOrders(exportFilter).length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: "bold", color: "#ec4899", borderTop: "2px solid #fce7f3", paddingTop: "10px", marginTop: "8px" }}>
                <span>Grand Total</span>
                <span>{rupiah(getFilteredOrders(exportFilter).reduce((sum, o) => sum + o.order.total, 0))}</span>
              </div>
              <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "12px", lineHeight: "18px" }}>
                Jangan lupa melakukan konfirmasi setelah melakukan pembayaran
              </p>
            </>
          )}
        </div>
      </div>

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

      {exportMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setExportMenuOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 z-10 mb-4 sm:mb-0">
            <p className="text-sm font-bold text-gray-800">Export Transaksi</p>
            <div className="space-y-2">
              <button onClick={() => exportAs("all")} className="w-full flex items-center gap-3 px-4 py-3 bg-pink-50 hover:bg-pink-100 rounded-xl transition-colors text-left">
                <FileImage className="w-5 h-5 text-pink-400 shrink-0" />
                <span className="text-sm font-medium text-gray-700">Semua Transaksi</span>
              </button>
              <button onClick={() => exportAs("uncompleted")} className="w-full flex items-center gap-3 px-4 py-3 bg-pink-50 hover:bg-pink-100 rounded-xl transition-colors text-left">
                <FileImage className="w-5 h-5 text-pink-400 shrink-0" />
                <span className="text-sm font-medium text-gray-700">Belum Lunas</span>
              </button>
            </div>
            <button onClick={() => setExportMenuOpen(false)} className="w-full py-3 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors">
              Batal
            </button>
          </div>
        </div>
      )}
      {waModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setWaModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3 z-10 mb-4 sm:mb-0 max-h-[70vh] flex flex-col">
            <p className="text-sm font-bold text-gray-800">Pilih Tagihan</p>
            <div className="overflow-y-auto flex-1 space-y-2 -mx-5 px-5">
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
                          {new Date(order.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                        </span>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getOrderStatusColor(order)}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                        {!isUnpaid && (
                          <span className="text-[10px] text-emerald-500 font-semibold">LUNAS</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                        {items.map((i) => `${i.product_name} x${i.quantity}`).join(", ")}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 font-semibold">{rupiah(order.total)}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
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
    </div>
  );
}
