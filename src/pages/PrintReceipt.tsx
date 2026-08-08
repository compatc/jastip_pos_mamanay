import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Printer, FileText, X } from "lucide-react";

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

export default function PrintReceipt() {
  const navigate = useNavigate();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handlePrint() {
    if (!pdfFile) {
      alert("Pilih file PDF terlebih dahulu.");
      return;
    }

    if (!navigator.bluetooth) {
      alert("Browser tidak mendukung Web Bluetooth. Gunakan Chrome/Edge.");
      return;
    }

    setPrinting(true);
    setStatus("Mencari printer...");

    try {
      // Request Bluetooth device
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: "POS" },
          { namePrefix: "BT" },
          { namePrefix: "Thermal" },
          { namePrefix: "Printer" },
          { namePrefix: "RPP" },
          { namePrefix: "GP" },
          { namePrefix: "TM" },
        ],
        optionalServices: ["battery_service"],
      });

      setPrinterName(device.name || "Printer");
      setStatus(`Mengkoneksi ke ${device.name || "printer"}...`);

      // Connect to GATT server
      const server = await device.gatt?.connect();
      if (!server) {
        setStatus("Gagal koneksi ke printer");
        setPrinting(false);
        return;
      }

      setStatus("Koneksi berhasil! Mempersiapkan cetak...");

      // Find writable characteristic
      const services = await server.getPrimaryServices();
      let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeChar = char;
              break;
            }
          }
          if (writeChar) break;
        } catch {
          continue;
        }
      }

      if (!writeChar) {
        setStatus("Tidak ditemukan printer yang kompatibel");
        setPrinting(false);
        return;
      }

      // Load PDF and convert to printable format
      setStatus("Memproses PDF...");

      // For now, we'll print a simple header
      // In production, you'd use pdf.js to extract text/images
      const header = buildPrintHeader(pdfFile.name);
      const data = new TextEncoder().encode(header);

      // Send in chunks
      const CHUNK_SIZE = 20;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        await writeChar.writeValue(chunk);
        await new Promise((r) => setTimeout(r, 50));
      }

      setStatus("Berhasil mengirim ke printer!");
    } catch (error) {
      if ((error as Error).name === "NotFoundError") {
        setStatus("Pembatalan - tidak ada printer dipilih");
      } else {
        setStatus("Error: " + (error as Error).message);
      }
    } finally {
      setPrinting(false);
    }
  }

  function buildPrintHeader(filename: string): string {
    let output = COMMANDS.init;
    output += COMMANDS.center;
    output += COMMANDS.bold;
    output += "RESI SHOPEE\n";
    output += COMMANDS.boldOff;
    output += COMMANDS.left;
    output += "==============================\n";
    output += `File: ${filename}\n`;
    output += `Tanggal: ${new Date().toLocaleDateString("id-ID")}\n`;
    output += "==============================\n";
    output += "\n";
    output += "Untuk mencetak resi dari PDF,\n";
    output += "silakan gunakan fitur Print\n";
    output += "bawaan browser/HP untuk PDF\n";
    output += "atau konversi ke gambar dulu.\n";
    output += "\n";
    output += "==============================\n";
    output += COMMANDS.feedLines(3);
    output += COMMANDS.cut;
    return output;
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
                  onClick={removeFile}
                  className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center hover:bg-red-200 transition-all"
                >
                  <X className="w-4 h-4 text-red-500" />
                </button>
              </div>

              {pdfPreview && (
                <iframe
                  src={pdfPreview}
                  className="w-full h-64 mt-3 border border-gray-200 rounded-xl"
                  title="PDF Preview"
                />
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

        {/* Status */}
        {status && (
          <div className={`rounded-xl p-3 mb-4 ${
            status.includes("Error") || status.includes("Gagal") || status.includes("Pembatalan")
              ? "bg-red-50 border border-red-200"
              : status.includes("Berhasil")
              ? "bg-green-50 border border-green-200"
              : "bg-yellow-50 border border-yellow-200"
          }`}>
            <p className={`text-sm font-semibold ${
              status.includes("Error") || status.includes("Gagal") || status.includes("Pembatalan")
                ? "text-red-700"
                : status.includes("Berhasil")
                ? "text-green-700"
                : "text-yellow-700"
            }`}>{status}</p>
          </div>
        )}

        {/* Print Button */}
        <button
          onClick={handlePrint}
          disabled={!pdfFile || printing}
          className="w-full py-3 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
        >
          <Printer className="w-4 h-4" />
          {printing ? "Mencetak..." : "Cetak via Bluetooth"}
        </button>

        {/* Info */}
        <div className="mt-4 p-4 bg-gray-50 rounded-xl">
          <p className="text-xs text-gray-500 font-semibold mb-2">Tips:</p>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• Gunakan Chrome atau Edge</li>
            <li>• Aktifkan Bluetooth di HP/laptop</li>
            <li>• Pastikan printer menyala dan visible</li>
            <li>• Untuk resi lengkap, gunakan Print bawaan PDF viewer</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
