import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { QrCode, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";

function QrImage({ svg }: { svg: string }) {
  return <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

interface Tx {
  transaction_id: string;
  status: string;
  amount: number;
  qr_url: string;
  qris_dynamic: string;
  qr_svg: string | null;
  expires_at: string;
  custom_unique_code?: number;
  unique_code?: number;
  original_amount?: number;
  final_amount?: number;
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

      // Hitung total sisa tagihan
      let totalAmount = 0;
      let orderIds: string[] = [];

      if (isMulti) {
        orderIds = multiIds;
        // Fetch orders untuk hitung total
        const ordersRes = await fetch("/api/temanqris", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", orderId: multiIds[0] }),
        });
        const ordersData = await ordersRes.json();
        if (ordersData.sisa) {
          totalAmount = ordersData.sisa * multiIds.length; // Approximate
        }
      } else {
        orderIds = [orderId || ""];
        // Fetch order untuk dapat sisa tagihan
        const orderRes = await fetch("/api/temanqris", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", orderId }),
        });
        const orderData = await orderRes.json();
        totalAmount = orderData.sisa || orderData.total || 0;
      }

      // Generate QRIS dinamis via TemanQRIS
      const res = await fetch("/api/temanqris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          amount: totalAmount || 1, // Will be updated with actual amount
          orderId: isMulti ? multiKey : orderId,
          description: isMulti
            ? `Pembayaran ${multiIds.length} pesanan`
            : `Pembayaran order ${orderId}`,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      // Set order info
      if (isMulti) {
        setOrders(
          multiIds.map((id) => ({
            id,
            customer_name: "Pelanggan",
            total: totalAmount,
            paid_total: 0,
            sisa: totalAmount,
            items: [],
          }))
        );
      } else {
        setOrder({
          id: orderId || "",
          customer_name: "Pelanggan",
          total: totalAmount,
          paid_total: 0,
          sisa: totalAmount,
          items: [],
        });
      }

      // Set transaction info
      setTx({
        transaction_id: data.payment_link || "",
        status: "pending",
        amount: data.final_amount || totalAmount,
        qr_url: data.payment_link || "",
        qris_dynamic: "",
        qr_svg: data.qr_image || null,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
        custom_unique_code: data.unique_code || 0,
        original_amount: data.original_amount || totalAmount,
        final_amount: data.final_amount || totalAmount,
      });
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
        const res = await fetch("/api/temanqris", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "status",
            orderId: isMulti ? multiIds[0] : orderId,
          }),
          signal: pollController.signal,
        });
        clearTimeout(pollTimer);
        const data = await res.json();

        if (data.status === "paid" || data.status === "completed") {
          setTx((prev) => (prev ? { ...prev, status: "paid" } : prev));

          // Verify order
          const confController = new AbortController();
          const confTimer = setTimeout(() => confController.abort(), 10000);
          const conf = await fetch("/api/temanqris", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "verify",
              orderId: isMulti ? multiIds[0] : orderId,
              amount: tx.amount,
              payerName: data.payer_name || "",
            }),
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
              {tx.qr_svg ? (
                <QrImage svg={tx.qr_svg} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-pink-300 animate-spin" />
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-1">Total yang harus dibayar</p>
            <p className="text-2xl font-extrabold text-gray-800 mb-1">{rupiah(tx.amount)}</p>
            {tx.custom_unique_code && tx.custom_unique_code > 0 ? (
              <p className="text-xs text-gray-400 mb-1">
                Sisa tagihan {rupiah(tx.original_amount || sisaTotal)} + kode unik {rupiah(tx.custom_unique_code)}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mb-1">
                {sisaTotal > 0 ? `Sisa tagihan: ${rupiah(sisaTotal)}` : ""}
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
