import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { QrCode, Loader2, CheckCircle2, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabase";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function PayOrder() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const multiKey = searchParams.get("orders") || "";
  const isMulti = multiKey.split(",").filter(Boolean).length > 1;

  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [kodeUnik, setKodeUnik] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

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

        const res = await fetch("/api/doku-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal membuat pembayaran");

        orderIdsRef.current = isMulti
          ? (data.group?.order_ids || actualOrderIds)
          : [actualOrderIds[0]];

        setAmount(data.group?.sisa_total || data.orders?.[0]?.sisa || 0);
        setPaymentUrl(data.paymentUrl || null);
      } catch (e: any) {
        setError(e.message || "Gagal");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, multiKey, isMulti]);

  useEffect(() => {
    if (!paymentUrl) return;
    const end = Date.now() + 30 * 60 * 1000;
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setCountdown(left);
      if (left <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [paymentUrl]);

  useEffect(() => {
    if (orderIdsRef.current.length === 0) return;

    const channel = supabase
      .channel("pay-order-status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload: { new?: { id?: string; payment_status?: string; payment_type?: string } }) => {
          const row = payload.new || {};
          if (orderIdsRef.current.includes(row.id || "") && (row.payment_status === "paid" || row.payment_type === "qris")) {
            setConfirmed(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderIdsRef.current.length]);

  function retry() {
    fetchedRef.current = false;
    setPaymentUrl(null);
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
            <h2 className="text-lg font-bold text-gray-800 mb-1">Pembayaran Berhasil!</h2>
            <p className="text-sm text-gray-500 mb-1">{rupiah(amount)}</p>
            <p className="text-xs text-emerald-500 font-semibold mb-6">Order telah ditandai lunas</p>
            <p className="text-xs text-gray-400 mb-4">Admin akan segera memproses pesanan Anda.</p>
            <button onClick={() => navigate("/catalog")} className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl font-semibold text-sm">
              Kembali Belanja
            </button>
          </div>
        )}

        {!loading && !error && paymentUrl && !confirmed && (
          <div className="text-center">
            <div className="mx-auto w-56 h-56 bg-gradient-to-br from-pink-50 to-rose-50 border-2 border-pink-100 rounded-2xl p-4 mb-4 flex flex-col items-center justify-center">
              <QrCode className="w-16 h-16 text-pink-400 mb-3" />
              <p className="text-sm font-semibold text-gray-700">DOKU QRIS</p>
              <p className="text-xs text-gray-400 mt-1">Klik tombol di bawah untuk bayar</p>
            </div>
            <p className="text-sm text-gray-500 mb-1">Total yang harus dibayar</p>
            <p className="text-2xl font-extrabold text-gray-800 mb-4">{rupiah(amount)}</p>
            {countdown !== null && countdown > 0 && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-4">
                <Clock className="w-3.5 h-3.5" />
                <span>Kedaluwarsa dalam {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span>
              </div>
            )}
            <a
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-pink-500 text-white rounded-xl font-bold text-sm hover:bg-pink-600 transition-colors shadow-lg shadow-pink-200"
            >
              Bayar Sekarang
              <ExternalLink className="w-4 h-4" />
            </a>
            <p className="text-[11px] text-gray-300 mt-4">
              Anda akan diarahkan ke halaman pembayaran DOKU
            </p>
          </div>
        )}

        {!loading && !error && !paymentUrl && !confirmed && (
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
