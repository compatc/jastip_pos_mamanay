import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { QrCode, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function PayOrder() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const multiKey = searchParams.get("orders") || "";
  const isMulti = multiKey.split(",").filter(Boolean).length > 1;

  const [qrImage, setQrImage] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [kodeUnik, setKodeUnik] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const txIdRef = useRef("");
  const orderIdsRef = useRef<string[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const actualOrderIds = isMulti
      ? multiKey.split(",").filter(Boolean)
      : orderId
        ? [orderId]
        : [];

    if (actualOrderIds.length === 0) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const body = isMulti
          ? { action: "create", orderIds: actualOrderIds }
          : { action: "create", orderId: actualOrderIds[0] };

        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal membuat QR");

        const tx = data.tx || {};
        const qrSvg = tx.qr_svg || null;

        txIdRef.current = tx.transaction_id || "";
        orderIdsRef.current = isMulti
          ? (data.group?.order_ids || actualOrderIds)
          : [actualOrderIds[0]];

        setAmount(tx.requested_amount || tx.amount || 0);
        setKodeUnik(tx.custom_unique_code || 0);
        setQrImage(qrSvg);
      } catch (e: any) {
        setError(e.message || "Gagal");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, multiKey, isMulti]);

  useEffect(() => {
    if (!qrImage) return;
    const end = Date.now() + 15 * 60 * 1000;
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setCountdown(left);
      if (left <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [qrImage]);

  useEffect(() => {
    if (!txIdRef.current || !qrImage) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "confirm",
            orderIds: orderIdsRef.current,
            transactionId: txIdRef.current,
          }),
        });
        const data = await res.json();
        if (data.status === "paid" || data.confirmed) {
          setConfirmed(true);
          clearInterval(poll);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [qrImage]);

  function retry() {
    fetchedRef.current = false;
    setQrImage(null);
    setConfirmed(false);
    setError(null);
    setAmount(0);
    setKodeUnik(0);
  }

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

        {loading && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
            <p className="text-sm text-gray-500">Membuat QRIS...</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-500 font-semibold mb-2">Gagal</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <button onClick={retry} className="px-5 py-2.5 bg-pink-500 text-white rounded-xl font-semibold text-sm">
                Coba lagi
              </button>
              <button onClick={() => navigate("/")} className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm">
                Beranda
              </button>
            </div>
          </div>
        )}

        {!loading && !error && confirmed && (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-gray-800 mb-1">Pembayaran diterima</h2>
            <p className="text-sm text-gray-500 mb-1">{rupiah(amount)}</p>
            <p className="text-xs text-emerald-500 font-semibold mb-6">Order telah ditandai lunas</p>
            <button onClick={() => window.close()} className="mt-2 px-6 py-2.5 bg-emerald-500 text-white rounded-xl font-semibold text-sm">
              Selesai
            </button>
          </div>
        )}

        {!loading && !error && qrImage && !confirmed && (
          <div className="text-center">
            <div className="mx-auto w-56 h-56 bg-white border-2 border-pink-100 rounded-2xl p-3 mb-4">
              {qrImage.startsWith("data:") ? (
                <img src={qrImage} alt="QRIS" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: qrImage }} />
              )}
            </div>
            <p className="text-sm text-gray-500 mb-1">Total yang harus dibayar</p>
            <p className="text-2xl font-extrabold text-gray-800 mb-1">{rupiah(amount)}</p>
            {kodeUnik > 0 && (
              <p className="text-[11px] text-gray-400 mb-1">
                (termasuk kode unik -{kodeUnik})
              </p>
            )}
            {countdown !== null && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-4">
                <Clock className="w-3.5 h-3.5" />
                <span>Kedaluwarsa dalam {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Menunggu pembayaran...
            </div>
            <p className="text-[11px] text-gray-300 mt-4">
              Buka aplikasi bank/e-wallet lalu pindai QR ini
            </p>
          </div>
        )}

        {!loading && !error && !qrImage && !confirmed && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">Tidak ada data QR</p>
            <button onClick={retry} className="mt-4 px-5 py-2.5 bg-pink-500 text-white rounded-xl font-semibold text-sm">
              Coba lagi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
