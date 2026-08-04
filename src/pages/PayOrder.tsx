import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { QrCode, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";

function QrImage({ url, color = "#ec4899" }: { url: string; color?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        const recolored = text
          .replace(/fill="#000000"/g, `fill="${color}"`)
          .replace(/fill="#000"/g, `fill="${color}"`)
          .replace(/fill="black"/g, `fill="${color}"`)
          .replace(/<rect([^>]*?)fill="#000000"/g, `<rect$1fill="${color}"`)
          .replace(/<path([^>]*?)fill="#000000"/g, `<path$1fill="${color}"`);
        setSvg(recolored);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url, color]);
  if (!svg) return <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-pink-300 animate-spin" /></div>;
  return <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

interface Tx {
  transaction_id: string;
  status: string;
  amount: number;
  qr_url: string;
  expires_at: string;
  custom_unique_code?: number;
  unique_code?: number;
}

interface OrderInfo {
  id: string;
  customer_name: string;
  total: number;
  paid_total: number;
  sisa: number;
  items: string[];
}

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function PayOrder() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const multiKey = searchParams.get("orders") || "";
  const multiIds = multiKey
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isMulti = multiIds.length > 0;

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [tx, setTx] = useState<Tx | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);

  const closePage = useCallback(() => {
    setClosing(true);
    window.close();
  }, []);

  const createPayment = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTx(null);
    setConfirmed(false);
    setOrder(null);
    setOrders([]);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isMulti ? { action: "create", orderIds: multiIds } : { action: "create", orderId }
        ),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      if (isMulti) {
        setOrders(data.orders || []);
      } else {
        setOrder(data.order);
      }
      setTx(data.tx);
    } catch (e: any) {
      if (e.name === "AbortError") {
        setError("Server lambat, coba lagi dalam beberapa saat.");
      } else {
        setError(e.message || "Gagal memuat pembayaran");
      }
    } finally {
      setLoading(false);
    }
  }, [orderId, isMulti, multiKey]);

  useEffect(() => {
    createPayment();
  }, [createPayment]);

  useEffect(() => {
    if (!tx || tx.status !== "pending") return;
    const t = new Date(tx.expires_at).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((t - Date.now()) / 1000));
      setCountdown(left);
      if (left <= 0) setTx((prev) => (prev ? { ...prev, status: "expired" } : prev));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [tx]);

  useEffect(() => {
    if (!tx || tx.status !== "pending") return;
    const poll = setInterval(async () => {
      try {
        const pollController = new AbortController();
        const pollTimer = setTimeout(() => pollController.abort(), 10000);
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", transactionId: tx.transaction_id }),
          signal: pollController.signal,
        });
        clearTimeout(pollTimer);
        const data = await res.json();
        if (data.status === "paid") {
          setTx((prev) => (prev ? { ...prev, status: "paid" } : prev));
          const confController = new AbortController();
          const confTimer = setTimeout(() => confController.abort(), 10000);
          const conf = await fetch("/api/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              isMulti
                ? { action: "confirm", orderIds: multiIds, transactionId: tx.transaction_id }
                : { action: "confirm", orderId, transactionId: tx.transaction_id }
            ),
            signal: confController.signal,
          });
          clearTimeout(confTimer);
          const confData = await conf.json();
          if (confData.confirmed) setConfirmed(true);
          clearInterval(poll);
        } else if (data.status === "expired") {
          setTx((prev) => (prev ? { ...prev, status: "expired" } : prev));
          clearInterval(poll);
        }
      } catch {
        // retry next tick
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [tx?.transaction_id, tx?.status, orderId, isMulti, multiKey]);

  const displayOrders = isMulti ? orders : order ? [order] : [];
  const sisaTotal = displayOrders.reduce((s, o) => s + (o.sisa || 0), 0);
  const customerName = displayOrders[0]?.customer_name || "Pelanggan";
  const allItems = displayOrders.flatMap((o) => o.items || []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl shadow-pink-100/30">
        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-2 mb-1">
            <QrCode className="w-5 h-5 text-pink-500" />
            <h1 className="text-lg font-bold text-gray-800">Bayar QRIS</h1>
          </div>
          <p className="text-xs text-gray-400">Jastip_mamanay</p>
        </div>

        {closing && (
          <div className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-gray-700 font-semibold">Terima kasih!</p>
            <p className="text-xs text-gray-400 mt-1">Halaman ini bisa ditutup.</p>
          </div>
        )}

        {!closing && loading && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
            <p className="text-sm text-gray-500">Membuat QRIS...</p>
          </div>
        )}

        {!closing && error && !loading && (
          <div className="py-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-500 font-semibold mb-2">Gagal</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={createPayment}
                className="px-5 py-2.5 bg-pink-500 text-white rounded-xl font-semibold text-sm"
              >
                Coba lagi
              </button>
              <button
                onClick={() => navigate("/")}
                className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm"
              >
                Beranda
              </button>
            </div>
          </div>
        )}

        {displayOrders.length > 0 && tx && tx.status === "pending" && (
          <div className="text-center">
            <div className="bg-pink-50 border border-pink-100 rounded-2xl p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">Untuk</p>
              <p className="text-sm font-bold text-gray-800 mb-1">{customerName}</p>
              {allItems.length > 0 && (
                <p className="text-xs text-gray-400">{allItems.join(", ")}</p>
              )}
              {isMulti && displayOrders.length > 1 && (
                <p className="text-[11px] text-pink-400 mt-1 font-semibold">
                  {displayOrders.length} pesanan digabung dalam 1 QRIS
                </p>
              )}
            </div>

            <div className="mx-auto w-56 h-56 bg-white border-2 border-pink-100 rounded-2xl p-3 mb-4">
              <QrImage url={tx.qr_url} color="#ec4899" />
            </div>
            <p className="text-sm text-gray-500 mb-1">Total yang harus dibayar</p>
            <p className="text-2xl font-extrabold text-gray-800 mb-1">{rupiah(tx.amount)}</p>
            {sisaTotal > 0 && tx.custom_unique_code != null && tx.custom_unique_code > 0 ? (
              <p className="text-xs text-gray-400 mb-1">
                Sisa tagihan {rupiah(sisaTotal)} - kode unik {rupiah(tx.custom_unique_code)} (lebih murah)
              </p>
            ) : (
              <p className="text-xs text-gray-400 mb-1">
                {sisaTotal > 0 ? `Sisa tagihan: ${rupiah(sisaTotal)}` : ""}
                {tx.unique_code > 0 && !(tx.custom_unique_code != null && tx.custom_unique_code > 0)
                  ? ` Termasuk kode unik ${tx.unique_code}`
                  : ""}
              </p>
            )}
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-4">
              <Clock className="w-3.5 h-3.5" />
              {countdown !== null && (
                <span>
                  Kedaluwarsa dalam {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Menunggu pembayaran...
            </div>
            <p className="text-[11px] text-gray-300 mt-4">
              Buka aplikasi bank/e-wallet lalu pindai QR ini
            </p>
          </div>
        )}

        {tx && tx.status === "paid" && (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-gray-800 mb-1">
              {confirmed ? "Pembayaran diterima" : "Pembayaran diterima"}
            </h2>
            <p className="text-sm text-gray-500 mb-1">{rupiah(tx.amount)}</p>
            {confirmed && (
              <p className="text-xs text-emerald-500 font-semibold mb-6">
                {isMulti && displayOrders.length > 1
                  ? "Semua pesanan telah ditandai lunas"
                  : "Order telah ditandai lunas"}
              </p>
            )}
            <button
              onClick={closePage}
              className="mt-6 px-6 py-2.5 bg-emerald-500 text-white rounded-xl font-semibold text-sm"
            >
              Selesai
            </button>
          </div>
        )}

        {tx && tx.status === "expired" && (
          <div className="py-10 text-center">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-gray-800 mb-1">QRIS kedaluwarsa</h2>
            <p className="text-sm text-gray-500 mb-6">Transaksi sudah lewat masa berlaku.</p>
            <button
              onClick={createPayment}
              className="px-6 py-2.5 bg-pink-500 text-white rounded-xl font-semibold text-sm"
            >
              Buat QRIS baru
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
