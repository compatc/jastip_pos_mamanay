import { useEffect, useRef, useState } from "react";
import { QrCode, Loader2, X, CheckCircle2, Clock } from "lucide-react";
import { createBoqrisTransaction, checkBoqrisStatus, type BoqrisTransaction } from "../lib/boqris";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

interface Props {
  visible: boolean;
  amount: number;
  invoiceNo?: string;
  onClose: () => void;
  onPaid: (tx: BoqrisTransaction) => void;
}

export default function QrisPaymentModal({ visible, amount, invoiceNo, onClose, onPaid }: Props) {
  const [tx, setTx] = useState<BoqrisTransaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTx(null);
    setError(null);
    setCountdown(null);
    setLoading(true);
    createBoqrisTransaction({ amount, invoice_no: invoiceNo })
      .then((t) => {
        setTx(t);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Gagal membuat QRIS");
        setLoading(false);
      });
  }, [visible, amount, invoiceNo]);

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
    pollRef.current = setInterval(async () => {
      try {
        const cur = await checkBoqrisStatus(tx.transaction_id);
        setTx(cur);
        if (cur.status === "paid") onPaid(cur);
      } catch {
        // ignore polling errors, retry next tick
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tx?.transaction_id, tx?.status]);

  useEffect(() => {
    if (!visible) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {loading && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
            <p className="text-sm text-gray-500">Membuat QRIS...</p>
          </div>
        )}

        {error && !loading && (
          <div className="py-10 text-center">
            <p className="text-red-500 font-semibold mb-2">Gagal membuat QRIS</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                createBoqrisTransaction({ amount, invoice_no: invoiceNo })
                  .then(setTx)
                  .catch((e) => setError(e.message || "Gagal membuat QRIS"))
                  .finally(() => setLoading(false));
              }}
              className="px-5 py-2.5 bg-pink-500 text-white rounded-xl font-semibold text-sm"
            >
              Coba lagi
            </button>
          </div>
        )}

        {tx && tx.status === "pending" && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <QrCode className="w-5 h-5 text-pink-500" />
              <h3 className="text-lg font-bold text-gray-800">Scan QRIS</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">Bayar dengan aplikasi apa pun yang mendukung QRIS</p>
            <div className="mx-auto w-56 h-56 bg-white border-2 border-pink-100 rounded-2xl p-3 mb-4">
              <img src={tx.qr_url} alt="QRIS" className="w-full h-full" />
            </div>
            <p className="text-sm text-gray-500 mb-1">Total yang harus dibayar</p>
            <p className="text-2xl font-extrabold text-gray-800 mb-2">{rupiah(tx.amount)}</p>
            <p className="text-xs text-gray-400 mb-1">Termasuk kode unik {tx.unique_code > 0 ? tx.unique_code : "0"}</p>
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
          </div>
        )}

        {tx && tx.status === "paid" && (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-800 mb-1">Pembayaran diterima</h3>
            <p className="text-sm text-gray-500">{rupiah(tx.amount)}</p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2.5 bg-emerald-500 text-white rounded-xl font-semibold text-sm"
            >
              Selesai
            </button>
          </div>
        )}

        {tx && tx.status === "expired" && (
          <div className="py-10 text-center">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-800 mb-1">QRIS kedaluwarsa</h3>
            <p className="text-sm text-gray-500 mb-6">Transaksi sudah lewat masa berlaku.</p>
            <button
              onClick={() => {
                setLoading(true);
                createBoqrisTransaction({ amount, invoice_no: invoiceNo })
                  .then(setTx)
                  .catch((e) => setError(e.message || "Gagal membuat QRIS"))
                  .finally(() => setLoading(false));
              }}
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
