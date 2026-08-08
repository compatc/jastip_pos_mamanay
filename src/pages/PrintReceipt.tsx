import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Printer, FileText, X, RotateCw, Bluetooth } from "lucide-react";
import { printReceipt, generateReceiptFromOrder } from "../lib/bluetoothPrinter";

const ESC = "\x1B";
const GS = "\x1D";

const COMMANDS = {
  init: ESC + "@",
  center: ESC + "a" + "\x01",
  left: ESC + "a" + "\x00",
  bold: ESC + "E" + "\x01",
  boldOff: ESC + "E" + "\x00",
  feedLines: (n: number) => ESC + "d" + String.fromCharCode(n),
  cut: GS + "V" + "\x01",
  normal: GS + "!" + "\x00",
};

type PrintMode = 'bluetooth' | 'share';

export default function PrintReceipt() {
  const navigate = useNavigate();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [rotation, setRotation] = useState(0);
  const [printMode, setPrintMode] = useState<PrintMode>('bluetooth');
  const [printProgress, setPrintProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Hanya file PDF yang diterima.");
      return;
    }

    setPdfFile(file);
    setPdfPreview(URL.createObjectURL(file));
    setStatus("");
  }

  function removeFile() {
    setPdfFile(null);
    if (pdfPreview) URL.revokeObjectURL(pdfPreview);
    setPdfPreview(null);
    setStatus("");
    setRotation(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function rotatePdf() {
    setRotation((prev) => (prev + 90) % 360);
  }

  async function handlePrint() {
    if (!pdfFile) {
      alert("Pilih file PDF terlebih dahulu.");
      return;
    }

    setPrinting(true);
    setPrintProgress("Mempersiapkan...");

    try {
      if (printMode === 'bluetooth') {
        // Direct Bluetooth printing
        setPrintProgress("Mencari printer...");
        
        // For Bluetooth, we'll share the PDF since we can't parse PDF to ESC/POS
        // The user can then use Thermer app to print
        if (navigator.share && navigator.canShare) {
          const file = new File([pdfFile], pdfFile.name, { type: "application/pdf" });
          
          if (navigator.canShare({ files: [file] })) {
            setPrintProgress("Membuka printer selection...");
            await navigator.share({
              title: "Cetak Resi via Bluetooth",
              text: "Pilih app printer (Thermer/Print) untuk cetak via Bluetooth",
              files: [file],
            });
            setStatus("✅ PDF di-share ke app printer. Pastikan printer sudah terhubung via Bluetooth.");
          } else {
            // Fallback: download
            downloadPdf();
          }
        } else {
          // Fallback: download
          downloadPdf();
        }
      } else {
        // Share mode - simple Web Share
        setPrintProgress("Membuka share...");
        if (navigator.share && navigator.canShare) {
          const file = new File([pdfFile], pdfFile.name, { type: "application/pdf" });
          
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: "Cetak Resi",
              text: "Share ke app printer",
              files: [file],
            });
            setStatus("✅ PDF sudah di-share!");
          } else {
            downloadPdf();
          }
        } else {
          downloadPdf();
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setStatus("Dibatalkan oleh user");
      } else {
        console.error("Print error:", error);
        setStatus("Error: " + (error as Error).message);
        // Fallback: download PDF
        downloadPdf();
      }
    } finally {
      setPrinting(false);
      setPrintProgress("");
    }
  }

  function downloadPdf() {
    if (!pdfFile) return;
    const url = URL.createObjectURL(pdfFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdfFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("PDF didownload. Buka dari File Manager lalu share ke app printer.");
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-4 pb-3 relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center shrink-0 hover:bg-gray-50 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-extrabold text-gray-900">Cetak Resi</h1>
        </div>
      </div>

      <main className="px-5 py-4 flex-1 overflow-y-auto pb-6">
        {/* Upload Area */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Upload PDF Resi Shopee</h2>

          {!pdfFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-pink-400 hover:bg-pink-50/30 transition-all cursor-pointer"
            >
              <Upload className="w-10 h-10 text-gray-400" />
              <p className="text-sm text-gray-500 font-semibold">Klik untuk upload PDF</p>
              <p className="text-xs text-gray-400">Format: PDF (Maks 5MB)</p>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <FileText className="w-10 h-10 text-red-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{pdfFile.name}</p>
                  <p className="text-xs text-gray-400">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={rotatePdf}
                  className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center hover:bg-blue-200 transition-all"
                  title="Rotate"
                >
                  <RotateCw className="w-4 h-4 text-blue-500" />
                </button>
                <button
                  onClick={removeFile}
                  className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center hover:bg-red-200 transition-all"
                >
                  <X className="w-4 h-4 text-red-500" />
                </button>
              </div>

              {pdfPreview && (
                <div className="mt-3 overflow-hidden border border-gray-200 rounded-xl">
                  <iframe
                    src={pdfPreview}
                    className="w-full h-64 origin-center transition-transform"
                    style={{ transform: `rotate(${rotation}deg)` }}
                    title="PDF Preview"
                  />
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Printer Status */}
        {printerName && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-blue-600 font-semibold">Printer Terhubung</p>
            <p className="text-sm font-bold text-blue-800">{printerName}</p>
          </div>
        )}

        {/* Print Mode Selector */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Mode Cetak</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPrintMode('bluetooth')}
              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                printMode === 'bluetooth'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Bluetooth className={`w-6 h-6 ${printMode === 'bluetooth' ? 'text-blue-500' : 'text-gray-400'}`} />
              <span className={`text-sm font-semibold ${printMode === 'bluetooth' ? 'text-blue-700' : 'text-gray-600'}`}>
                Bluetooth
              </span>
              <span className="text-xs text-gray-400">Koneksi langsung</span>
            </button>
            <button
              onClick={() => setPrintMode('share')}
              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                printMode === 'share'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Printer className={`w-6 h-6 ${printMode === 'share' ? 'text-green-500' : 'text-gray-400'}`} />
              <span className={`text-sm font-semibold ${printMode === 'share' ? 'text-green-700' : 'text-gray-600'}`}>
                Share
              </span>
              <span className="text-xs text-gray-400">Via app lain</span>
            </button>
          </div>
        </div>

        {/* Status */}
        {status && (
          <div className={`rounded-xl p-3 mb-4 ${
            status.includes("Error") || status.includes("Gagal") || status.includes("Dibatalkan")
              ? "bg-red-50 border border-red-200"
              : status.includes("✅") || status.includes("Berhasil")
              ? "bg-green-50 border border-green-200"
              : "bg-yellow-50 border border-yellow-200"
          }`}>
            <p className={`text-sm font-semibold ${
              status.includes("Error") || status.includes("Gagal") || status.includes("Dibatalkan")
                ? "text-red-700"
                : status.includes("✅") || status.includes("Berhasil")
                ? "text-green-700"
                : "text-yellow-700"
            }`}>{status}</p>
          </div>
        )}

        {/* Print Progress */}
        {printProgress && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
              <p className="text-sm text-blue-700 font-semibold">{printProgress}</p>
            </div>
          </div>
        )}

        {/* Print Button */}
        <button
          onClick={handlePrint}
          disabled={!pdfFile || printing}
          className={`w-full py-3 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 ${
            printMode === 'bluetooth'
              ? 'bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white'
              : 'bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 text-white'
          }`}
        >
          {printMode === 'bluetooth' ? (
            <Bluetooth className="w-4 h-4" />
          ) : (
            <Printer className="w-4 h-4" />
          )}
          {printing ? "Mencetak..." : printMode === 'bluetooth' ? "Cetak via Bluetooth" : "Share PDF"}
        </button>

        {/* Info */}
        <div className="mt-4 p-4 bg-gray-50 rounded-xl">
          <p className="text-xs text-gray-500 font-semibold mb-2">Tips:</p>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• Gunakan Chrome di Android</li>
            <li>• Aktifkan Bluetooth di HP</li>
            <li>• <strong>Pairing printer dulu</strong> di Pengaturan Bluetooth HP</li>
            <li>• Setelah pairing, baru klik "Cetak via Bluetooth"</li>
            <li>• Jika tidak muncul, matikan nyalakan Bluetooth</li>
            <li>• Pastikan printer menyala dan dalam jangkauan</li>
            <li>• Mode Bluetooth: akan membuka Thermer/Print app</li>
            <li>• Mode Share: pilih app untuk share PDF</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
