import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { X, QrCode, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { generateQris, checkQrisStatus } from "../lib/qrisly";

interface QrisPaymentModalProps {
  visible: boolean;
  amount: number;
  onPaid: () => void;
  onClose: () => void;
}

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function QrisPaymentModal({ visible, amount, onPaid, onClose }: QrisPaymentModalProps) {
  const [phase, setPhase] = useState<"loading" | "qr" | "paid" | "expired" | "error">("loading");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [finalAmount, setFinalAmount] = useState(amount);
  const [errorMsg, setErrorMsg] = useState("");
  const [remainingSec, setRemainingSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paidRef = useRef(false);

  function stopTimers() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    timerRef.current = null;
    pollRef.current = null;
  }

  useEffect(() => {
    if (!visible) {
      stopTimers();
      return;
    }
    paidRef.current = false;
    setPhase("loading");
    setQrDataUrl("");
    setErrorMsg("");

    (async () => {
      try {
        const res = await generateQris(amount);
        const data = res.data;
        if (!data || !data.qris_string) {
          setErrorMsg(res.meta?.message || "Gagal generate QRIS. Cek konfigurasi API.");
          setPhase("error");
          return;
        }
        const qr = await QRCode.toDataURL(data.qris_string, { width: 280, margin: 1 });
        setQrDataUrl(qr);
        setFinalAmount(data.final_amount || amount);
        setPhase("qr");

        const expiry = data.expiry_time ? new Date(data.expiry_time.replace(" ", "T")).getTime() : 0;
        if (expiry) {
          const updateRemaining = () => {
            const sec = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
            setRemainingSec(sec);
            if (sec <= 0) {
              stopTimers();
              setPhase("expired");
            }
          };
          updateRemaining();
          timerRef.current = setInterval(updateRemaining, 1000);
        }

        const poll = async () => {
          if (!data.history_id) return;
          const status = await checkQrisStatus(data.history_id);
          const st = status.data?.payment_status;
          if (st === "paid" && !paidRef.current) {
            paidRef.current = true;
            stopTimers();
            setPhase("paid");
            setTimeout(onPaid, 1200);
          } else if (st === "expired") {
            stopTimers();
            setPhase("expired");
          }
        };
        poll();
        pollRef.current = setInterval(poll, 5000);
      } catch (e: any) {
        setErrorMsg(e?.message || "Terjadi kesalahan");
        setPhase("error");
      }
    })();

    return () => {
      stopTimers();
    };
  }, [visible, amount, onPaid]);

  if (!visible) return null;

  const min = Math.floor(remainingSec / 60);
  const sec = remainingSec % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl shadow-pink-200/30 border border-pink-100 w-full max-w-sm p-5 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-pink-500" />
            Pembayaran QRIS
          </p>
          <button
            onClick={onClose}
            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase === "loading" && (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
            <p className="text-sm text-gray-400">Membuat QRIS...</p>
          </div>
        )}

        {phase === "qr" && (
          <>
            <div className="bg-white border border-pink-100 rounded-2xl p-4 flex flex-col items-center">
              <img src={qrDataUrl} alt="QRIS" className="w-56 h-56" />
              <p className="mt-3 text-xs text-gray-400 text-center leading-relaxed">
                Scan QRIS di atas untuk membayar
                <br />
                <span className="text-gray-500 font-medium">Total: {rupiah(finalAmount)}</span>
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs">
              <RefreshCw className="w-3.5 h-3.5 text-pink-500 animate-spin" />
              <span className="text-gray-500">Menunggu pembayaran...</span>
              <span className="text-amber-600 font-bold">
                {min}:{String(sec).padStart(2, "0")}
              </span>
            </div>
          </>
        )}

        {phase === "paid" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <p className="text-base font-bold text-gray-800">Pembayaran Diterima!</p>
            <p className="text-sm text-gray-400">Order akan ditandai lunas.</p>
          </div>
        )}

        {phase === "expired" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <AlertTriangle className="w-12 h-12 text-amber-500" />
            <p className="text-base font-bold text-gray-800">QRIS Kedaluwarsa</p>
            <p className="text-sm text-gray-400">Silakan tutup dan buka kembali untuk QRIS baru.</p>
          </div>
        )}

        {phase === "error" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <AlertTriangle className="w-12 h-12 text-red-500" />
            <p className="text-base font-bold text-gray-800">Gagal Membuat QRIS</p>
            <p className="text-sm text-gray-400 text-center">{errorMsg}</p>
          </div>
        )}

        {phase !== "loading" && phase !== "paid" && (
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-semibold transition-all"
          >
            Tutup
          </button>
        )}
      </div>
    </div>
  );
}
