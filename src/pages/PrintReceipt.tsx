import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Printer, FileText, X, RotateCw, Bluetooth, Image } from "lucide-react";
import { printImage, printPdfDirect } from "../lib/bluetoothPrinter";

type PrintMode = 'pdf' | 'image';

export default function PrintReceipt() {
  const navigate = useNavigate();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [rotation, setRotation] = useState(0);
  const [printMode, setPrintMode] = useState<PrintMode>('pdf');
  const [printProgress, setPrintProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Hanya file gambar yang diterima.");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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

  function removeImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setStatus("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function rotatePdf() {
    setRotation((prev) => (prev + 90) % 360);
  }

  async function handleSharePdf() {
    if (!pdfFile) {
      alert("Pilih file PDF terlebih dahulu.");
      return;
    }

    setPrinting(true);
    setStatus("Membuka share...");

    try {
      if (navigator.share && navigator.canShare) {
        const file = new File([pdfFile], pdfFile.name, { type: "application/pdf" });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "Cetak Resi",
            text: "Pilih app printer (Thermer/Print) untuk cetak",
            files: [file],
          });
          setStatus("✅ PDF di-share! Pilih app printer untuk cetak.");
        } else {
          downloadPdf();
        }
      } else {
        downloadPdf();
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setStatus("Dibatalkan");
      } else {
        setStatus("Error: " + (error as Error).message);
        downloadPdf();
      }
    } finally {
      setPrinting(false);
    }
  }

  async function handlePrintPdfDirect() {
    if (!pdfFile) {
      alert("Pilih file PDF terlebih dahulu.");
      return;
    }

    setPrinting(true);
    setPrintProgress("Mempersiapkan...");

    try {
      const success = await printPdfDirect(pdfFile, (progress) => {
        setPrintProgress(progress);
      });
      
      if (success) {
        setStatus("✅ Berhasil cetak PDF!");
      } else {
        setStatus("Gagal mencetak. Pastikan printer sudah terhubung.");
      }
    } catch (error) {
      console.error("Print PDF error:", error);
      setStatus("Error: " + (error as Error).message);
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
    setStatus("PDF didownload. Buka lalu share ke app printer.");
  }

  async function handlePrintImage() {
    if (!imageFile) {
      alert("Pilih gambar terlebih dahulu.");
      return;
    }

    setPrinting(true);
    setPrintProgress("Mempersiapkan...");

    try {
      const success = await printImage(imageFile, (progress) => {
        setPrintProgress(progress);
      });
      
      if (success) {
        setStatus("✅ Berhasil cetak gambar!");
      } else {
        setStatus("Gagal mencetak. Pastikan printer sudah terhubung.");
      }
    } catch (error) {
      console.error("Print image error:", error);
      setStatus("Error: " + (error as Error).message);
    } finally {
      setPrinting(false);
      setPrintProgress("");
    }
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
        {/* Mode Selector */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Pilih Mode Cetak</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPrintMode('pdf')}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                printMode === 'pdf'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <FileText className={`w-8 h-8 ${printMode === 'pdf' ? 'text-green-500' : 'text-gray-400'}`} />
              <span className={`text-sm font-bold ${printMode === 'pdf' ? 'text-green-700' : 'text-gray-600'}`}>
                PDF Shopee
              </span>
              <span className="text-xs text-gray-400 text-center">Cetak langsung atau share</span>
            </button>
            <button
              onClick={() => setPrintMode('image')}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                printMode === 'image'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Image className={`w-8 h-8 ${printMode === 'image' ? 'text-purple-500' : 'text-gray-400'}`} />
              <span className={`text-sm font-bold ${printMode === 'image' ? 'text-purple-700' : 'text-gray-600'}`}>
                Foto/Gambar
              </span>
              <span className="text-xs text-gray-400 text-center">Screenshot/foto</span>
            </button>
          </div>
        </div>

        {/* PDF Upload Mode */}
        {printMode === 'pdf' && (
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

            {/* Print Buttons for PDF */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handlePrintPdfDirect}
                disabled={!pdfFile || printing}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                <Bluetooth className="w-4 h-4" />
                {printing ? (printProgress || "Mencetak...") : "Cetak Langsung"}
              </button>
              <button
                onClick={handleSharePdf}
                disabled={!pdfFile || printing}
                className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                {printing ? "Mencetak..." : "Share ke App"}
              </button>
            </div>
          </div>
        )}

        {/* Image Upload Mode */}
        {printMode === 'image' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Upload Foto/Gambar</h2>

            {!imageFile ? (
              <div
                onClick={() => imageInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-purple-400 hover:bg-purple-50/30 transition-all cursor-pointer"
              >
                <Image className="w-10 h-10 text-gray-400" />
                <p className="text-sm text-gray-500 font-semibold">Klik untuk upload gambar</p>
                <p className="text-xs text-gray-400">Format: JPG, PNG (Maks 5MB)</p>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <Image className="w-10 h-10 text-purple-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{imageFile.name}</p>
                    <p className="text-xs text-gray-400">{(imageFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    onClick={removeImage}
                    className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center hover:bg-red-200 transition-all"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>

                {imagePreview && (
                  <div className="mt-3 overflow-hidden border border-gray-200 rounded-xl">
                    <img
                      src={imagePreview}
                      className="w-full h-64 object-contain bg-gray-100"
                      alt="Preview"
                    />
                  </div>
                )}
              </div>
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />

            {/* Print Button for Image */}
            <button
              onClick={handlePrintImage}
              disabled={!imageFile || printing}
              className="w-full mt-4 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              <Bluetooth className="w-4 h-4" />
              {printing ? (printProgress || "Mencetak...") : "Cetak via Bluetooth"}
            </button>
          </div>
        )}

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

        {/* Info */}
        <div className="mt-4 p-4 bg-gray-50 rounded-xl">
          <p className="text-xs text-gray-500 font-semibold mb-2">Tips:</p>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• <strong>PDF Shopee</strong>: "Cetak Langsung" (Bluetooth) atau "Share ke App" (Thermer)</li>
            <li>• <strong>Foto/Gambar</strong>: Upload screenshot/foto → cetak langsung via Bluetooth</li>
            <li>• Pairing printer dulu di Pengaturan Bluetooth HP</li>
            <li>• Gunakan Chrome di Android</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
