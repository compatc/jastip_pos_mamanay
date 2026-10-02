import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Printer,
  Truck,
  Package,
  StickyNote,
  Upload,
  ExternalLink,
} from "lucide-react";

interface InvoiceItem {
  order_id?: string;
  product_id: string | null;
  product_name: string;
  variant: string | null;
  quantity: number;
  price: number;
  discount?: number;
  image: string;
  stock_type: "ready" | "po" | null;
  weight: number;
  unit: string;
}

interface InvoiceOrder {
  id: string;
  customer_id: string | null;
  created_at: string;
  invoice_sent_at: string | null;
  total: number;
  diskon: number;
  kode_unik: number;
  ongkir: number;
  paid_total: number;
  payment_status: string;
  fulfillment_status: string;
  status: string;
  notes: string;
  packing_photo: string;
  courier: string;
  resi: string;
  payment_type: string;
  order_type: string;
  shipping_method: string | null;
  shopee_order_no?: string;
}

interface InvoiceData {
  order: InvoiceOrder;
  orders?: InvoiceOrder[];
  customer: {
    id?: string;
    name: string;
    phone: string;
    address: string;
    points?: number;
    member_level?: string;
  } | null;
  awardedPoints?: number;
  items: InvoiceItem[];
  totals: {
    subtotal: number;
    sisa: number;
    deadline: string | null;
    total?: number;
    diskon?: number;
    kode_unik?: number;
    ongkir?: number;
    paid_total?: number;
    payment_status?: string;
  };
  shopee: { url: string; pcs: number; weight_g: number };
}

const BANK_INFO = "BCA 5271330651 a.n. Nurul Azizah";
const COURIER_LABELS: Record<string, string> = {
  jnt: "J&T",
  shopee: "Shopee",
  indopaket: "Indopaket",
  jne: "JNE",
  lion: "LION PARCEL",
};

function rupiah(n: number): string {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

type StepState = "done" | "active" | "pending";

function Progress({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <div className="flex mt-4">
      {steps.map((s, i) => {
        const next = steps[i + 1];
        const lineDone = next && next.state !== "pending";
        return (
          <div key={s.label} className="flex-1 text-center relative">
            {i < steps.length - 1 && (
              <div
                className={`absolute top-[10px] left-1/2 right-[-50%] h-0.5 z-0 ${
                  lineDone ? "bg-emerald-500" : "bg-slate-200"
                }`}
              />
            )}
            <div
              className={`w-[22px] h-[22px] rounded-full mx-auto mb-1 flex items-center justify-center text-[10px] text-white relative z-10 ${
                s.state === "done"
                  ? "bg-emerald-500"
                  : s.state === "active"
                    ? "bg-pink-500 ring-4 ring-pink-100"
                    : "bg-slate-200"
              }`}
            >
              {s.state === "done" ? "✓" : s.state === "active" ? "●" : i + 1}
            </div>
            <div
              className={`text-[9px] font-semibold ${
                s.state === "done"
                  ? "text-emerald-600"
                  : s.state === "active"
                    ? "text-pink-500"
                    : "text-slate-400"
              }`}
            >
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Invoice() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const queryIds = searchParams.get("orders") || "";
  const orderIds = orderId
    ? [orderId]
    : queryIds.split(",").map((s) => s.trim()).filter(Boolean);
  const idsKey = orderIds.join(",");

  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payTab, setPayTab] = useState<"qris" | "bca">("qris");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrAmount, setQrAmount] = useState(0);
  const [qrKodeUnik, setQrKodeUnik] = useState(0);
  const [qrCreatedAt, setQrCreatedAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [txId, setTxId] = useState("");

  const [shippingMethod, setShippingMethod] = useState<string>("");
  const [shopeeNo, setShopeeNo] = useState<string>("");
  const [shopeeNoInput, setShopeeNoInput] = useState<string>("");
  const [shopeeSaving, setShopeeSaving] = useState(false);
  const [buktiState, setBuktiState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [toast, setToast] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);

  const pollRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  const fetchInvoice = async () => {
    if (orderIds.length === 0) {
      setLoading(false);
      setError("Link invoice tidak valid");
      return;
    }
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invoice", orderIds }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal memuat invoice");
      setData(d);
      const first = (d.orders && d.orders[0]) || d.order;
      setShippingMethod(first?.shipping_method || "");
      setShopeeNo(first?.shopee_order_no || "");
      setShopeeNoInput(first?.shopee_order_no || "");
      setError(null);
    } catch (e: any) {
      setError(e.message || "Gagal memuat invoice");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Toast setelah checkout katalog (Opsi A): /invoice/{id}?new=1
  useEffect(() => {
    if (searchParams.get("new")) {
      showToast("✓ Pesanan terkirim! Link juga dikirim ke WhatsApp");
      const p = new URLSearchParams(searchParams);
      p.delete("new");
      const qs = p.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? "?" + qs : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!qrSvg) return;
    const createdAtMs = qrCreatedAt ? new Date(qrCreatedAt).getTime() : Date.now();
    const end = createdAtMs + 15 * 60 * 1000;
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setCountdown(left);
      if (left <= 0) {
        clearInterval(t);
        setQrExpired(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [qrSvg, qrCreatedAt]);

  useEffect(() => {
    if (!txId || !qrSvg || pollRef.current) return;
    pollRef.current = true;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", orderIds, transactionId: txId }),
        });
        const d = await res.json();
        if (d.status === "paid" || d.confirmed) {
          setConfirmed(true);
          clearInterval(poll);
          setTimeout(() => fetchInvoice(), 1500);
        } else if (d.status === "expired") {
          setQrExpired(true);
          clearInterval(poll);
        }
      } catch {}
    }, 5000);
    return () => {
      clearInterval(poll);
      pollRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId, qrSvg]);

  async function startQr() {
    if (orderIds.length === 0) return;
    setQrLoading(true);
    setQrError(null);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", orderIds }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal membuat QR");
      if (d.status === "paid" || d.confirmed) {
        setConfirmed(true);
        fetchInvoice();
        return;
      }
      const tx = d.tx || {};
      if (!tx.qr_svg) throw new Error("QR tidak tersedia. Coba lagi.");
      setTxId(tx.transaction_id || "");
      setQrSvg(tx.qr_svg);
      setQrAmount(tx.requested_amount || tx.amount || 0);
      setQrKodeUnik(tx.custom_unique_code || 0);
      setQrCreatedAt(tx.created_at || null);
      setQrExpired(false);
      setCountdown(null);
    } catch (e: any) {
      setQrError(e.message || "Gagal");
    } finally {
      setQrLoading(false);
    }
  }

  function resetQr() {
    pollRef.current = false;
    setQrSvg(null);
    setTxId("");
    setQrExpired(false);
    setQrCreatedAt(null);
    setCountdown(null);
    setQrError(null);
    setConfirmed(false);
  }

  async function chooseShipping(method: "manual" | "shopee") {
    const prev = shippingMethod;
    setShippingMethod(method);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shipping", orderIds, method }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal menyimpan");
      showToast(
        method === "shopee"
          ? "Pilihan disimpan ✓ penjual sudah diberi tahu"
          : "Pilihan pengiriman disimpan ✓"
      );
    } catch (e: any) {
      setShippingMethod(prev);
      showToast(e.message || "Gagal menyimpan");
    }
  }

  async function saveShopeeNo() {
    if (shopeeSaving) return;
    const val = shopeeNoInput.trim();
    if (!val) {
      showToast("Isi nomor pesanan Shopee dulu");
      return;
    }
    setShopeeSaving(true);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "shipping",
          orderIds,
          method: "shopee",
          shopee_order_no: val,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal menyimpan");
      setShopeeNo(val);
      showToast("No. Shopee disimpan ✓ penjual sudah diberi tahu");
    } catch (e: any) {
      showToast(e.message || "Gagal menyimpan");
    } finally {
      setShopeeSaving(false);
    }
  }

  async function uploadBukti(file: File) {
    if (!data) return;
    setBuktiState("uploading");
    try {
      const fd = new FormData();
      fd.append("order_id", orderIds[0]);
      fd.append("order_ids", orderIds.join(","));
      if (data.order.customer_id) fd.append("customer_id", data.order.customer_id);
      fd.append("amount", String(data.totals.sisa));
      fd.append("transfer_date", new Date().toISOString().slice(0, 10));
      fd.append("bukti", file);
      const res = await fetch("/api/payment-confirm", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || "Gagal upload");
      setBuktiState("done");
      showToast("Bukti transfer terkirim, menunggu verifikasi admin ✓");
    } catch (e: any) {
      setBuktiState("error");
      showToast(e.message || "Gagal upload bukti");
    }
  }

  function copyText(txt: string, label: string) {
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
    showToast(label + " disalin ✓");
  }

  async function confirmRedeem() {
    if (!redeemOrder || !customer?.id || redeemBusy) return;
    const pts = Math.min(redeemMaxPoints, Math.max(0, parseInt(redeemPoints, 10) || 0));
    if (pts < 100) return;
    setRedeemBusy(true);
    try {
      const res = await fetch("/api/redeem-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customer.id, order_id: redeemOrder.id, points: pts }),
      });
      const j = await res.json();
      if (j.success) {
        setRedeemPoints("");
        await fetchInvoice();
        showToast(`✅ ${j.pointsUsed} poin → diskon ${rupiah(j.discount)} · sisa poin ${j.newPoints}`);
      } else {
        showToast(j.error || "Gagal menukar poin");
      }
    } catch (e: any) {
      showToast(e.message || "Gagal menukar poin");
    } finally {
      setRedeemBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-100 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
        <p className="text-sm text-slate-500 font-semibold">Memuat invoice…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-7 max-w-sm w-full text-center border border-slate-200">
          <AlertCircle className="w-11 h-11 text-red-400 mx-auto mb-3" />
          <p className="font-bold text-slate-800 mb-1">Invoice tidak ditemukan</p>
          <p className="text-sm text-slate-500 mb-5">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-pink-500 text-white rounded-xl font-bold text-sm"
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  const { customer, items, totals, shopee } = data;
  const ordersList: InvoiceOrder[] =
    data.orders && data.orders.length > 0 ? data.orders : [data.order];
  const order = ordersList[0];
  const isMulti = ordersList.length > 1;
  const sisa = totals.sisa;
  const sumDiskon = totals.diskon ?? ordersList.reduce((s, o) => s + (o.diskon || 0), 0);
  const sumKodeUnik = totals.kode_unik ?? ordersList.reduce((s, o) => s + (o.kode_unik || 0), 0);
  const sumOngkir = totals.ongkir ?? ordersList.reduce((s, o) => s + (o.ongkir || 0), 0);
  const sumPaid = totals.paid_total ?? ordersList.reduce((s, o) => s + (o.paid_total || 0), 0);
  const isPaid = sisa <= 0;
  const paymentStatus =
    totals.payment_status ||
    (isPaid ? "paid" : sumPaid > 0 ? "dp" : order.payment_status || "unpaid");
  const isCancelled = ordersList.every((o) => o.fulfillment_status === "cancelled");
  const totalDue = Math.max(0, totals.subtotal + sumOngkir - sumDiskon - sumKodeUnik);
  const paidDisplay = sumPaid > 0 ? sumPaid : totalDue;
  const custPoints = customer?.points || 0;
  const redeemOrder = !isMulti && !isPaid && !isCancelled ? order : null;
  const redeemTierMax = redeemOrder
    ? (redeemOrder.total || 0) < 50000
      ? 5000
      : (redeemOrder.total || 0) < 500000
        ? 10000
        : 20000
    : 0;
  const redeemMaxDiskon = redeemOrder
    ? Math.max(0, Math.min(redeemTierMax, redeemOrder.total || 0) - (redeemOrder.diskon || 0))
    : 0;
  const redeemMaxPoints = Math.max(
    0,
    Math.min(custPoints, Math.ceil(redeemMaxDiskon / 1000) * 100)
  );
  const redeemPts = Math.max(0, parseInt(redeemPoints, 10) || 0);
  const redeemPreview = Math.min(Math.floor(redeemPts / 100) * 1000, redeemMaxDiskon);
  const showRedeem = !!redeemOrder && custPoints >= 100 && redeemMaxDiskon > 0;
  const READY_FULFILL = new Set(["ready", "shipped", "diterima", "completed"]);
  const readyOrderIds = new Set(
    ordersList.filter((o) => READY_FULFILL.has(o.fulfillment_status)).map((o) => o.id)
  );
  const isPoItem = (it: InvoiceItem) =>
    it.stock_type === "po" && !readyOrderIds.has(it.order_id || order.id);
  const hasPo = items.some((i) => isPoItem(i));
  const phoneDigits = (customer?.phone || "").replace(/\D/g, "");
  const phoneLast4 = phoneDigits.slice(-4);
  const noteShopee = `${(customer?.name || "Pelanggan").split(" ")[0]} ${phoneLast4}`.trim();
  const invoiceNo = `INV-${(order.created_at || "").slice(0, 10).replace(/-/g, "")}-${(order.id || "").slice(0, 4).toUpperCase()}${
    isMulti ? ` +${ordersList.length - 1} lainnya` : ""
  }`;
  const invoicePath = isMulti
    ? `invoice?orders=${ordersList.map((o) => o.id).join(",")}`
    : `invoice/${order.id}`;

  const itemsByOrderId = new Map<string, InvoiceItem[]>();
  for (const it of items) {
    const key = it.order_id || order.id;
    if (!itemsByOrderId.has(key)) itemsByOrderId.set(key, []);
    itemsByOrderId.get(key)!.push(it);
  }

  type Stage = "po" | "dikemas" | "shipped" | "done";
  const stageOf = (o: InvoiceOrder): Stage => {
    const po = (itemsByOrderId.get(o.id) || []).some((i) => isPoItem(i));
    if (o.fulfillment_status === "completed") return "done";
    if (o.fulfillment_status === "shipped" || o.fulfillment_status === "diterima") return "shipped";
    if (o.fulfillment_status === "ready") return "dikemas";
    if (o.fulfillment_status === "belum_ready") return po ? "po" : "dikemas";
    if (po && !isPaid) return "po";
    return "dikemas";
  };
  const stages = ordersList.map(stageOf);
  const sameStage = stages.every((s) => s === stages[0]);
  const stage: Stage = stages[0];
  const STAGE_LABEL: Record<Stage, string> = {
    po: "Dipesan (PO)",
    dikemas: "Dikemas",
    shipped: "Dikirim",
    done: "Selesai",
  };

  const stageSteps: Record<typeof stage, { label: string; state: StepState }[]> = {
    po: [
      { label: "Dipesan (PO)", state: "active" },
      { label: "Ready", state: "pending" },
      { label: "Dikirim", state: "pending" },
      { label: "Selesai", state: "pending" },
    ],
    dikemas: [
      { label: "Dibuat", state: "done" },
      { label: "Dikemas", state: "active" },
      { label: "Dikirim", state: "pending" },
      { label: "Selesai", state: "pending" },
    ],
    shipped: [
      { label: "Dibuat", state: "done" },
      { label: "Dikemas", state: "done" },
      { label: "Dikirim", state: "active" },
      { label: "Selesai", state: "pending" },
    ],
    done: [
      { label: "Dibuat", state: "done" },
      { label: "Dikemas", state: "done" },
      { label: "Dikirim", state: "done" },
      { label: "Selesai", state: "done" },
    ],
  };

  const payPill = isCancelled
    ? { label: "Dibatalkan", cls: "bg-red-50 text-red-600", dot: "bg-red-500" }
    : paymentStatus === "paid" || isPaid
      ? { label: "Lunas", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" }
      : paymentStatus === "dp"
        ? { label: "DP", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" }
        : { label: "Belum Dibayar", cls: "bg-red-50 text-red-600", dot: "bg-red-500" };

  const fulfillMap: Record<string, { label: string; cls: string; dot: string }> = {
    belum_ready: hasPo
      ? { label: "Pre-order · Belum Ready", cls: "bg-orange-50 text-orange-700", dot: "bg-orange-500" }
      : { label: "Belum Ready", cls: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
    ready: { label: "Sedang Dikemas", cls: "bg-purple-50 text-purple-600", dot: "bg-purple-500" },
    shipped: { label: "Dalam Perjalanan", cls: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
    diterima: { label: "Diterima", cls: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
    completed: { label: "Selesai", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
    cancelled: { label: "Dibatalkan", cls: "bg-red-50 text-red-600", dot: "bg-red-500" },
  };
  const sameFulfill = ordersList.every(
    (o) => o.fulfillment_status === order.fulfillment_status
  );
  const fulfillPill = isCancelled
    ? fulfillMap.cancelled
    : sameFulfill
      ? fulfillMap[order.fulfillment_status] || fulfillMap.ready
      : { label: `${ordersList.length} pesanan`, cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };

  const packings = ordersList.filter((o) => o.packing_photo);
  const resiRows = ordersList.filter(
    (o) => o.resi && (stageOf(o) === "shipped" || stageOf(o) === "done")
  );
  const notesRows = ordersList.filter((o) => o.notes);
  const paymentType = ordersList.map((o) => o.payment_type).find((t) => t) || "QRIS";

  const card = "bg-white border border-slate-200/80 rounded-2xl p-4 mb-3";
  const labelTitle =
    "text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5";

  const memberLevel = customer?.member_level || "silver";
  const pointMult = memberLevel === "platinum" ? 1.2 : memberLevel === "gold" ? 1.1 : 1;
  const futurePoints =
    !isPaid && !isCancelled && sisa > 0 ? Math.floor((sisa / 1000) * pointMult) : 0;
  const awardedPoints = data.awardedPoints || 0;

  return (
    <div className="min-h-dvh bg-slate-100 pb-8">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      {/* HEADER */}
      <div className="bg-[linear-gradient(135deg,#ec4899_0%,#f43f5e_50%,#e11d48_100%)] px-4 pt-5 pb-12 rounded-b-[28px]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-base">
            🧾
          </div>
          <div>
            <div className="text-white font-extrabold text-[15px] leading-tight">jastip_mamanay</div>
            <div className="text-white/75 text-[9px] font-bold uppercase tracking-[1.5px]">
              Invoice Penjualan
            </div>
          </div>
        </div>
        <div className="mt-4 text-white">
          <h1 className="text-xl font-extrabold tracking-tight">Invoice Belanja</h1>
          <span className="inline-block mt-1.5 bg-white/20 border border-white/25 backdrop-blur px-2.5 py-1 rounded-lg font-mono text-[13px] font-bold tracking-wide">
            {invoiceNo}
          </span>
          <div className="text-[11px] text-white/80 mt-1.5">
            📅 {fmtDateTime(order.created_at)} WIB{isMulti ? ` · ${ordersList.length} pesanan` : ""}
          </div>
        </div>
      </div>

      <div className="px-4 -mt-8 relative z-10 max-w-lg mx-auto">
        {/* STATUS + PROGRESS */}
        <div className={card}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full ${payPill.cls}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${payPill.dot}`} />
              {payPill.label}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full ${fulfillPill.cls}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${fulfillPill.dot}`} />
              {fulfillPill.label}
            </span>
          </div>
          {sameStage ? (
            <Progress steps={stageSteps[stage]} />
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              {ordersList.map((o, idx) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5"
                >
                  <span className="font-mono text-[11px] text-slate-500 shrink-0">
                    #{(o.id || "").slice(0, 6).toUpperCase()}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {STAGE_LABEL[stages[idx]]}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      (fulfillMap[o.fulfillment_status] || fulfillMap.ready).cls
                    }`}
                  >
                    {(fulfillMap[o.fulfillment_status] || fulfillMap.ready).label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PO BANNER */}
        {hasPo && stages.includes("po") && !isCancelled && (
          <div className={card}>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-[12px] text-orange-800 leading-relaxed">
              🕐 Sebagian barang adalah <b>pre-order</b>. Pesanan dikirim setelah semua barang ready —
              satu paket, satu kali kirim, biar ongkir cuma sekali.
              <div className="mt-2 pt-2 border-t border-dashed border-orange-200 flex justify-between text-[11px]">
                <span>Status barang</span>
                <b>Menunggu ready dari supplier</b>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMER */}
        {customer && (
          <div className={card}>
            <div className={labelTitle}>👤 Pelanggan</div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center text-lg">
                👩
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">{customer.name}</div>
                {customer.phone && <div className="text-[11px] text-slate-400">📱 {customer.phone}</div>}
              </div>
            </div>
            {customer.address && (
              <div className="mt-2.5 bg-slate-50 rounded-xl p-2.5 text-[11px] text-slate-500 leading-relaxed">
                <b className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
                  📍 Alamat Kirim
                </b>
                {customer.address}
              </div>
            )}
            <div className="mt-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-amber-800">✨ Poin loyalitas</span>
                <span className="text-[15px] font-extrabold text-amber-900">
                  {(customer.points || 0).toLocaleString("id-ID")}
                </span>
              </div>
              <div className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">
                100 poin = Rp1.000 diskon
                {memberLevel !== "silver" ? ` · level ${memberLevel} (poin ×${pointMult})` : ""} —
                {showRedeem ? " tukar poin di bawah ↓" : " tukar lewat portal customer"}
              </div>
              {futurePoints > 0 && (
                <div className="text-[11px] font-bold text-amber-900 mt-1">
                  🎁 Bayar invoice ini → dapat ≈ +{futurePoints.toLocaleString("id-ID")} poin
                </div>
              )}
              {awardedPoints > 0 && (
                <div className="text-[11px] font-extrabold text-emerald-700 mt-1">
                  ✅ +{awardedPoints.toLocaleString("id-ID")} poin sudah masuk dari invoice ini
                </div>
              )}
            </div>
          </div>
        )}

        {/* ITEMS */}
        <div className={card}>
          <div className={labelTitle}>
            🛍️ Rincian Barang
            <span className="ml-auto normal-case tracking-normal text-[10px] text-slate-400">
              <span className="text-emerald-600 font-bold">
                {items.filter((i) => !isPoItem(i)).length} ready
              </span>
              {" · "}
              <span className="text-orange-600 font-bold">{items.filter((i) => isPoItem(i)).length} pre-order</span>
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {(isMulti
              ? ordersList.map((o) => ({ ref: o, groupItems: itemsByOrderId.get(o.id) || [] }))
              : [{ ref: order, groupItems: items }]
            ).map((grp) => (
              <div key={grp.ref.id} className="bg-slate-50 rounded-xl overflow-hidden">
                {isMulti && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white border-b border-slate-100">
                    <span className="font-mono text-[11px] font-bold text-slate-500 shrink-0">
                      #{(grp.ref.id || "").slice(0, 6).toUpperCase()}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full truncate ${
                        (fulfillMap[grp.ref.fulfillment_status] || fulfillMap.ready).cls
                      }`}
                    >
                      {(fulfillMap[grp.ref.fulfillment_status] || fulfillMap.ready).label}
                    </span>
                    <span className="text-[11px] font-bold text-slate-700 shrink-0">
                      {rupiah(grp.ref.total)}
                    </span>
                  </div>
                )}
                {grp.groupItems.map((it, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2.5 p-3 ${
                      idx > 0 ? "border-t border-slate-100" : ""
                    }`}
                  >
                    {it.image ? (
                      <img
                        src={it.image}
                        alt=""
                        className="w-11 h-11 rounded-xl object-cover bg-white border border-slate-100 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-lg shrink-0">
                        🛍️
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-slate-800 leading-snug">
                        {it.product_name}
                        {it.variant && (
                          <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md ml-1.5 align-middle">
                            {it.variant}
                          </span>
                        )}
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ml-1.5 align-middle ${
                            isPoItem(it)
                              ? "bg-orange-100 text-orange-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {isPoItem(it) ? "PO" : "Ready"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {isPoItem(it)
                          ? "Pre-order · dikirim setelah ready"
                          : "Dikirim bersama pesanan"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-bold text-slate-700">
                        {rupiah(it.price * it.quantity - (it.discount || 0))}
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        × {it.quantity}
                        {it.quantity > 1 ? ` @ ${rupiah(it.price)}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* TOTALS */}
          <div className="mt-3 pt-2.5 border-t border-dashed border-slate-200 text-[13px]">
            <div className="flex justify-between py-0.5 text-slate-500">
              <span>Subtotal ({items.length} jenis barang)</span>
              <span>{rupiah(totals.subtotal)}</span>
            </div>
            {sumDiskon > 0 && (
              <div className="flex justify-between py-0.5 text-emerald-600">
                <span>🏷️ Diskon</span>
                <span>− {rupiah(sumDiskon)}</span>
              </div>
            )}
            {sumOngkir > 0 && (
              <div className="flex justify-between py-0.5 text-slate-500">
                <span>🚚 Ongkir</span>
                <span>{rupiah(sumOngkir)}</span>
              </div>
            )}
            {sumKodeUnik > 0 && (
              <div className="flex justify-between py-0.5 text-slate-500">
                <span>🔑 Kode unik QRIS</span>
                <span>− {rupiah(sumKodeUnik)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 mt-1.5 border-t border-slate-800 font-extrabold text-[16px] text-slate-900">
              <span>TOTAL TAGIHAN</span>
              <span>{rupiah(totalDue)}</span>
            </div>
            {sumPaid > 0 && !isPaid && (
              <div className="flex justify-between py-0.5 text-emerald-600 font-semibold">
                <span>Sudah dibayar</span>
                <span>− {rupiah(sumPaid)}</span>
              </div>
            )}
            {isPaid ? (
              <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex justify-between items-center">
                <span className="text-[12px] font-bold text-emerald-700">✅ LUNAS</span>
                <span className="text-[13px] font-extrabold text-emerald-700">
                  {rupiah(paidDisplay)}
                </span>
              </div>
            ) : (
              <div className="mt-2 bg-pink-50 border border-pink-200 rounded-xl px-3 py-2 flex justify-between items-center">
                <span className="text-[12px] font-bold text-pink-700">SISA BAYAR</span>
                <span className="text-[16px] font-extrabold text-pink-600">{rupiah(sisa)}</span>
              </div>
            )}
          </div>
        </div>

        {/* CANCELLED */}
        {isCancelled && (
          <div className={card}>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-700 font-semibold">
              ⛔ Pesanan ini dibatalkan. Hubungi penjual kalau ada pertanyaan.
            </div>
          </div>
        )}

        {/* REDEEM POINTS */}
        {showRedeem && (
          <div className="bg-white border border-amber-200 rounded-2xl p-4 mb-3">
            <div className="text-[13px] font-extrabold text-amber-800 mb-0.5">✨ Tukar Poin</div>
            <div className="text-[11px] text-slate-500 mb-2.5">
              Saldo <b>{custPoints.toLocaleString("id-ID")} poin</b> · maks diskon{" "}
              {rupiah(redeemMaxDiskon)} untuk invoice ini
            </div>
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {[100, 500, 1000].map((n) => (
                <button
                  key={n}
                  onClick={() =>
                    setRedeemPoints(
                      String(Math.min(redeemMaxPoints, (parseInt(redeemPoints, 10) || 0) + n))
                    )
                  }
                  className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] font-bold text-amber-700"
                >
                  +{n}
                </button>
              ))}
              <button
                onClick={() => setRedeemPoints(String(redeemMaxPoints))}
                className="px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-lg text-[11px] font-bold text-amber-800"
              >
                Maks
              </button>
              <button
                onClick={() => setRedeemPoints("")}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-500"
              >
                Reset
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={redeemMaxPoints}
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                placeholder="Jumlah poin (kelipatan 100)"
                className="flex-1 min-w-0 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[13px] font-bold text-amber-900 outline-none focus:border-amber-400"
              />
              <button
                onClick={confirmRedeem}
                disabled={redeemBusy || redeemPts < 100 || redeemPreview <= 0}
                className="px-4 py-2.5 bg-amber-500 disabled:opacity-40 text-white rounded-xl text-[13px] font-extrabold shrink-0"
              >
                {redeemBusy ? "..." : "Tukar"}
              </button>
            </div>
            {redeemPts >= 100 && (
              <div className="text-[12px] font-bold text-emerald-600 mt-2">
                {redeemPts.toLocaleString("id-ID")} poin → diskon {rupiah(redeemPreview)} · sisa
                poin {Math.max(0, custPoints - redeemPts).toLocaleString("id-ID")}
              </div>
            )}
            <div className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              100 poin = Rp1.000 diskon · batas per invoice: {rupiah(redeemMaxDiskon)}
            </div>
          </div>
        )}

        {/* PAYMENT: UNPAID */}
        {!isPaid && !isCancelled && (
          <div className="rounded-2xl mb-3 p-4 border border-rose-200 bg-[linear-gradient(135deg,#fff1f2,#ffe4e6)]">
            <div className="text-[12px] font-extrabold uppercase tracking-wide text-rose-700">
              ⚠️ Menunggu Pembayaran
            </div>
            <div className="text-[26px] font-extrabold tracking-tight text-slate-900 mt-0.5">
              {rupiah(sisa)}
            </div>
            <div className="text-[11px] text-slate-500">
              {paymentStatus === "dp" && "DP diterima · "}
              {totals.deadline && new Date(totals.deadline).getTime() > Date.now()
                ? `Bayar sebelum ${fmtDateTime(totals.deadline)} WIB`
                : "Segera bayar agar pesanan diproses"}
            </div>

            <div className="flex gap-1.5 mt-3">
              <button
                onClick={() => setPayTab("qris")}
                className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                  payTab === "qris"
                    ? "bg-rose-700 border-rose-700 text-white"
                    : "bg-white border-rose-200 text-rose-800"
                }`}
              >
                ▣ Bayar QRIS
              </button>
              <button
                onClick={() => setPayTab("bca")}
                className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                  payTab === "bca"
                    ? "bg-rose-700 border-rose-700 text-white"
                    : "bg-white border-rose-200 text-rose-800"
                }`}
              >
                🏦 Transfer BCA
              </button>
            </div>

            {/* QRIS pane */}
            {payTab === "qris" && (
              <div className="mt-3">
                {qrLoading && (
                  <div className="py-7 flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
                    <p className="text-xs text-slate-500 font-semibold">Membuat QRIS…</p>
                  </div>
                )}
                {!qrLoading && qrError && (
                  <div className="py-4 text-center">
                    <p className="text-xs text-red-500 font-semibold mb-2">{qrError}</p>
                    <button
                      onClick={startQr}
                      className="px-4 py-2 bg-rose-700 text-white rounded-xl text-xs font-bold"
                    >
                      Coba lagi
                    </button>
                  </div>
                )}
                {!qrLoading && !qrError && !qrSvg && (
                  <button
                    onClick={startQr}
                    className="w-full py-3.5 bg-[linear-gradient(135deg,#e11d48,#be123c)] text-white rounded-xl font-extrabold text-[15px] shadow-lg shadow-rose-300 active:scale-[0.98] transition-transform"
                  >
                    💳 Bayar Sekarang
                  </button>
                )}
                {!qrLoading && !qrError && qrSvg && !qrExpired && !confirmed && (
                  <div className="text-center">
                    <div className="mx-auto w-52 h-52 bg-white border-2 border-rose-200 rounded-2xl p-2.5 mb-3 overflow-hidden">
                      {qrSvg.startsWith("data:") ? (
                        <img src={qrSvg} alt="QRIS" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full [&_svg]:block [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                      )}
                    </div>
                    <p className="text-[13px] font-extrabold text-slate-900">{rupiah(qrAmount - qrKodeUnik)}</p>
                    {qrKodeUnik > 0 && (
                      <p className="text-[10px] text-slate-400">
                        sisa {rupiah(qrAmount)} · kode unik −{qrKodeUnik}
                      </p>
                    )}
                    {countdown !== null && (
                      <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        Kadaluarsa {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 animate-pulse mt-2">
                      <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                      Menunggu pembayaran… (update otomatis ≤1 menit)
                    </p>
                  </div>
                )}
                {!qrLoading && qrExpired && !confirmed && (
                  <div className="py-4 text-center">
                    <Clock className="w-9 h-9 text-amber-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 mb-3">QR kedaluarsa (15 menit)</p>
                    <button
                      onClick={resetQr}
                      className="px-4 py-2.5 bg-rose-700 text-white rounded-xl text-xs font-bold"
                    >
                      Buat QR Baru
                    </button>
                  </div>
                )}
                {confirmed && (
                  <div className="py-5 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800">Pembayaran Berhasil!</p>
                    <p className="text-[11px] text-emerald-600 font-semibold">Invoice diperbarui otomatis…</p>
                  </div>
                )}
              </div>
            )}

            {/* BCA pane */}
            {payTab === "bca" && (
              <div className="mt-3">
                <div className="bg-white border border-rose-200 rounded-xl p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-extrabold text-slate-900">BCA</span>
                    <span className="bg-[#0054a6] text-white text-[10px] font-extrabold px-2 py-0.5 rounded tracking-widest">
                      BCA
                    </span>
                  </div>
                  <div
                    className="font-mono text-[17px] font-bold tracking-wider text-slate-900 mt-2 flex items-center gap-2 cursor-pointer"
                    onClick={() => copyText("5271330651", "Nomor rekening")}
                  >
                    5271330651 <Copy className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">a.n. Nurul Azizah</div>
                  <div className="mt-2 bg-rose-50 rounded-lg px-2.5 py-2 text-[12px] text-rose-700 font-bold flex justify-between">
                    <span>Nominal persis</span>
                    <span>{rupiah(sisa)}</span>
                  </div>
                </div>
                <label className="block mt-2.5">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadBukti(f);
                    }}
                  />
                  <span className="block w-full py-3 border-[1.5px] border-dashed border-rose-400 bg-rose-50 text-rose-700 rounded-xl text-[13px] font-bold text-center cursor-pointer">
                    {buktiState === "uploading" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Mengirim…
                      </span>
                    ) : buktiState === "done" ? (
                      "✅ Bukti terkirim — menunggu verifikasi"
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Upload className="w-4 h-4" /> Upload Bukti Transfer
                      </span>
                    )}
                  </span>
                </label>
                <p className="text-[10px] text-rose-600 font-semibold text-center mt-2 leading-relaxed">
                  Verifikasi manual oleh penjual · {BANK_INFO}
                </p>
              </div>
            )}
          </div>
        )}

        {/* PAID BOX */}
        {isPaid && !isCancelled && (
          <div className="rounded-2xl mb-3 p-4 border border-emerald-200 bg-[linear-gradient(135deg,#f0fdf4,#dcfce7)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide text-emerald-700">
                  ✅ Pembayaran Diterima
                </div>
                <div className="text-[24px] font-extrabold tracking-tight text-slate-900 mt-0.5">
                  {rupiah(paidDisplay)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {sumPaid > 0 ? `Terbayar ${rupiah(sumPaid)} · ` : ""}
                  {paymentType ? paymentType.toUpperCase() : "QRIS"}
                </div>
              </div>
              <div className="w-11 h-11 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xl font-extrabold shadow-lg shadow-emerald-200">
                ✓
              </div>
            </div>
          </div>
        )}

        {/* SHIPPING CHOICE */}
        {!isCancelled && ordersList.some((o) => o.order_type === "penjualan") && (
          <div className={card}>
            <div className={labelTitle}>
              🚚 Metode Pengiriman
              {shippingMethod === "" && (
                <span className="ml-auto normal-case tracking-normal text-[10px] text-amber-600 font-bold">
                  belum dipilih
                </span>
              )}
            </div>
            {shippingMethod === "" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-800 leading-relaxed mb-2.5">
                ⬇️ Pilih metode pengiriman dulu supaya penjual bisa segera memproses.
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div
                onClick={() => chooseShipping("manual")}
                className={`border-[1.5px] rounded-xl p-3 cursor-pointer transition-all ${
                  shippingMethod === "manual"
                    ? "border-pink-500 bg-pink-50/60"
                    : "border-slate-200 bg-white hover:border-pink-200"
                }`}
              >
                <div className="flex gap-2.5 items-start">
                  <div
                    className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${
                      shippingMethod === "manual" ? "border-pink-500 bg-[radial-gradient(circle,#ec4899_0_4px,#fdf2f8_5px)]" : "border-slate-300"
                    }`}
                  />
                  <div>
                    <div className="text-[13px] font-bold text-slate-800">📮 Kirim Manual</div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                      JNT / JNE / LION PARCEL — admin yang atur kurir &amp; ongkir setelah pembayaran
                    </div>
                  </div>
                </div>
                {shippingMethod === "manual" && (
                  <div className="mt-2.5 pt-2.5 border-t border-dashed border-pink-200">
                    <div className="bg-slate-50 rounded-lg p-2.5 text-[11px] text-slate-500 leading-relaxed">
                      Setelah lunas, admin konfirmasi kurir + ongkir via WhatsApp. Estimasi tiba{" "}
                      <b className="text-slate-800">2–4 hari</b> · resiko ditanggung penjual sampai
                      diterima.
                    </div>
                    <a
                      href={`https://wa.me/6285894652806?text=${encodeURIComponent(
                        `Halo Mama Nay, saya mau konfirmasi pengiriman untuk invoice ${invoiceNo}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center justify-center gap-1.5 bg-[#25d366]/10 border border-[#25d366]/40 text-[#128c7e] rounded-xl py-2 text-[12px] font-extrabold no-print"
                    >
                      💬 Chat penjual via WhatsApp
                    </a>
                  </div>
                )}
              </div>

              <div
                onClick={() => chooseShipping("shopee")}
                className={`border-[1.5px] rounded-xl p-3 cursor-pointer transition-all ${
                  shippingMethod === "shopee"
                    ? "border-pink-500 bg-pink-50/60"
                    : "border-slate-200 bg-white hover:border-pink-200"
                }`}
              >
                <div className="flex gap-2.5 items-start">
                  <div
                    className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${
                      shippingMethod === "shopee" ? "border-pink-500 bg-[radial-gradient(circle,#ec4899_0_4px,#fdf2f8_5px)]" : "border-slate-300"
                    }`}
                  />
                  <div>
                    <div className="text-[13px] font-bold text-slate-800">🛒 Kirim via Shopee</div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                      Checkout sendiri di Shopee — ongkir &amp; resi Shopee, paket lebih aman
                    </div>
                  </div>
                </div>
                {shippingMethod === "shopee" && (
                  <div className="mt-2.5 pt-2.5 border-t border-dashed border-pink-200">
                    <div className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-[12px] font-extrabold px-3 py-1.5 rounded-lg mb-2">
                      Checkout <span className="text-pink-300 text-[15px]">{shopee.pcs}</span> pcs
                      <span className="font-semibold text-slate-400 text-[10px]">
                        berat {(shopee.weight_g / 1000).toFixed(1).replace(".", ",")} kg
                      </span>
                    </div>
                    <div className="flex gap-2 items-center bg-white border border-rose-200 rounded-lg p-2">
                      <span className="flex-1 min-w-0 font-mono text-[11px] text-slate-500 truncate">
                        {shopee.url}
                      </span>
                      <a
                        href={shopee.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#ee4d2d] text-white px-3 py-1.5 rounded-lg text-[11px] font-extrabold no-print inline-flex items-center gap-1 shrink-0"
                      >
                        Buka Shopee <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="mt-2 bg-amber-50 border border-dashed border-amber-300 rounded-lg p-2.5 text-[11px] text-amber-800 flex justify-between items-center gap-2">
                      <span>
                        📝 Catatan (tempel di kolom catatan Shopee):
                        <br />
                        <b>{noteShopee}</b>
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyText(noteShopee, "Catatan");
                        }}
                        className="bg-white border border-amber-300 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold text-amber-700 shrink-0 no-print"
                      >
                        ⧉ Salin
                      </button>
                    </div>
                    <div className="mt-2 text-[10px] text-red-600 font-semibold leading-relaxed">
                      ⚠️ Wajib isi catatan di atas, tanpa catatan pesanan tidak bisa dicocokkan. Resiko
                      paket hilang/rusak via Shopee ditanggung pembeli.
                    </div>
                    <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[11px] font-extrabold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Pilihan disimpan — penjual
                      sudah diberi tahu
                    </div>
                    <div className="mt-2.5 bg-white border border-slate-200 rounded-xl p-2.5">
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                        🧾 No. pesanan Shopee (opsional)
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={shopeeNoInput}
                          onChange={(e) => setShopeeNoInput(e.target.value)}
                          placeholder="cth. 260930847291103"
                          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-[13px] font-mono text-slate-800 focus:outline-none focus:border-pink-400 no-print"
                        />
                        <button
                          onClick={saveShopeeNo}
                          disabled={
                            shopeeSaving ||
                            !shopeeNoInput.trim() ||
                            shopeeNoInput.trim() === shopeeNo
                          }
                          className="bg-slate-900 text-white px-3 rounded-lg text-[11px] font-extrabold disabled:opacity-40 shrink-0 no-print"
                        >
                          {shopeeSaving ? "…" : "Simpan"}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        {shopeeNo
                          ? `Tersimpan: ${shopeeNo} — penjual sudah dapat notif.`
                          : "Diisi setelah kamu checkout di Shopee. Penjual dapat notif otomatis saat disimpan."}
                      </p>
                    </div>
                    <a
                      href={`https://wa.me/6285894652806?text=${encodeURIComponent(
                        `Halo Mama Nay, saya sudah pilih kirim via Shopee untuk invoice ${invoiceNo}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center justify-center gap-1.5 bg-[#25d366]/10 border border-[#25d366]/40 text-[#128c7e] rounded-xl py-2 text-[12px] font-extrabold no-print"
                    >
                      💬 Chat penjual via WhatsApp
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PACKING PHOTO */}
        {isPaid && packings.length > 0 && (
          <div className={card}>
            <div className={labelTitle}>📦 Foto Packing</div>
            <div className="flex flex-col gap-3">
              {packings.map((o) => (
                <div key={o.id} className="flex items-center gap-3">
                  <img
                    src={o.packing_photo || ""}
                    alt="Foto packing"
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200"
                  />
                  <div className="text-[12px] text-slate-500 leading-relaxed">
                    <b className="block text-slate-800 text-[13px]">
                      {isMulti ? `Pesanan #${(o.id || "").slice(0, 6).toUpperCase()}` : "Pesanan dipacking"}
                    </b>
                    Klik foto untuk memperbesar. Resi menyusul via WhatsApp.
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESI */}
        {resiRows.length > 0 && (
          <div className={card}>
            <div className={labelTitle}>🚚 Info Pengiriman</div>
            <div className="flex flex-col gap-2">
              {resiRows.map((o) => {
                const st = stageOf(o);
                const fp = fulfillMap[o.fulfillment_status] || fulfillMap.ready;
                return (
                  <div key={o.id} className="bg-slate-50 rounded-xl px-3">
                    {isMulti && (
                      <div className="font-mono text-[11px] font-bold text-slate-500 pt-2">
                        #{(o.id || "").slice(0, 6).toUpperCase()}
                      </div>
                    )}
                    <div className="flex justify-between py-2 text-[12px] text-slate-500">
                      <span>Kurir</span>
                      <b className="text-slate-800">
                        {COURIER_LABELS[o.courier] || o.courier || "-"}
                      </b>
                    </div>
                    <div className="flex justify-between py-2 text-[12px] text-slate-500 border-t border-slate-100">
                      <span>No. Resi</span>
                      <b className="font-mono text-slate-800 tracking-wide">{o.resi}</b>
                    </div>
                    <div className="flex justify-between py-2 text-[12px] text-slate-500 border-t border-slate-100">
                      <span>Status</span>
                      <b className="text-blue-700">
                        {sameFulfill && !isMulti ? fulfillPill.label : fp.label}
                      </b>
                    </div>
                    {isMulti && st === "po" && (
                      <div className="pb-2 text-[10px] font-bold text-orange-600">Menunggu barang ready</div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              Resi juga dikirim otomatis ke WhatsApp kamu
            </p>
          </div>
        )}

        {/* NOTES */}
        {notesRows.length > 0 && (
          <div className={card}>
            <div className={labelTitle}>
              <StickyNote className="w-3.5 h-3.5" /> Catatan dari penjual
            </div>
            <div className="flex flex-col gap-2">
              {notesRows.map((o) => (
                <div
                  key={o.id}
                  className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12px] text-amber-900 leading-relaxed"
                >
                  {isMulti && (
                    <b className="block font-mono text-[10px] text-amber-600 mb-1">
                      #{(o.id || "").slice(0, 6).toUpperCase()}
                    </b>
                  )}
                  {o.notes}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIONS */}
        <div className="flex gap-2 mb-1 no-print">
          <button
            onClick={() => window.print()}
            className="flex-1 py-3 bg-white border-[1.5px] border-slate-200 rounded-xl text-[13px] font-bold text-slate-600 inline-flex items-center justify-center gap-1.5 hover:border-pink-400 hover:text-pink-500 transition-colors"
          >
            <Printer className="w-4 h-4" /> Simpan PDF
          </button>
          <button
            onClick={() => copyText(window.location.href, "Link invoice")}
            className="flex-1 py-3 bg-white border-[1.5px] border-slate-200 rounded-xl text-[13px] font-bold text-slate-600 inline-flex items-center justify-center gap-1.5 hover:border-pink-400 hover:text-pink-500 transition-colors"
          >
            <Copy className="w-4 h-4" /> Salin Link
          </button>
        </div>

        <div className="text-center text-[10px] text-slate-400 leading-relaxed py-3">
          Link invoice ini bisa dibuka kapan saja tanpa login.
          <br />
          <b className="text-slate-500 break-all">
            mamanay.vercel.app/{invoicePath}
          </b>
          <div className="mt-2 inline-flex items-center gap-1.5 text-slate-400">
            <Truck className="w-3 h-3" />
            <Package className="w-3 h-3" />
            jastip_mamanay
          </div>
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[12px] font-bold shadow-xl z-50 no-print">
          {toast}
        </div>
      )}
    </div>
  );
}
