import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Printer, FileText, X, RotateCw, Bluetooth, Image, Layers } from "lucide-react";
import { printImage, printPdfDirect, printPdfBatch } from "../lib/bluetoothPrinter";
import type { PrintOptions } from "../lib/bluetoothPrinter";

type PrintMode = 'pdf' | 'image' | 'batch';

export default function PrintReceipt() {
  const navigate = useNavigate();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [printMode, setPrintMode] = useState<PrintMode>('pdf');
  const [printProgress, setPrintProgress] = useState<string>("");
  const [printOptions, setPrintOptions] = useState<PrintOptions>({
    rotation: 90,
    sharpness: 128,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

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

  function handleBatchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const pdfFiles = Array.from(files).filter(f => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      alert("Tidak ada file PDF yang dipilih.");
      return;
    }

    setBatchFiles(pdfFiles);
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeBatch() {
    setBatchFiles([]);
    setStatus("");
    if (batchInputRef.current) batchInputRef.current.value = "";
  }

  function removeImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setStatus("");
    if (imageInputRef.current) imageInputRef.current.value = "";
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
      }, printOptions);
      
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

  async function handlePrintBatch() {
    if (batchFiles.length === 0) {
      alert("Pilih file PDF terlebih dahulu.");
      return;
    }

    setPrinting(true);
    setPrintProgress("Mempersiapkan...");

    try {
      const result = await printPdfBatch(batchFiles, (progress) => {
        setPrintProgress(progress);
      }, printOptions);
      
      if (result.failed === 0) {
        setStatus(`✅ Berhasil cetak ${result.success} PDF!`);
      } else {
        setStatus(`Cetak: ${result.success} berhasil, ${result.failed} gagal`);
      }
    } catch (error) {
      console.error("Print batch error:", error);
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
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setPrintMode('pdf')}
              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                printMode === 'pdf'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <FileText className={`w-6 h-6 ${printMode === 'pdf' ? 'text-green-500' : 'text-gray-400'}`} />
              <span className={`text-xs font-bold ${printMode === 'pdf' ? 'text-green-700' : 'text-gray-600'}`}>
                1 PDF
              </span>
            </button>
            <button
              onClick={() => setPrintMode('batch')}
              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                printMode === 'batch'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Layers className={`w-6 h-6 ${printMode === 'batch' ? 'text-blue-500' : 'text-gray-400'}`} />
              <span className={`text-xs font-bold ${printMode === 'batch' ? 'text-blue-700' : 'text-gray-600'}`}>
                Batch PDF
              </span>
            </button>
            <button
              onClick={() => setPrintMode('image')}
              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                printMode === 'image'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Image className={`w-6 h-6 ${printMode === 'image' ? 'text-purple-500' : 'text-gray-400'}`} />
              <span className={`text-xs font-bold ${printMode === 'image' ? 'text-purple-700' : 'text-gray-600'}`}>
                Gambar
              </span>
            </button>
          </div>
        </div>

        {/* Print Options */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Pengaturan Cetak</h2>
          <div className="space-y-3">
            {/* Rotation */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Rotasi</span>
              <div className="flex gap-2">
                {[0, 90, 180, 270].map(deg => (
                  <button
                    key={deg}
                    onClick={() => setPrintOptions(prev => ({ ...prev, rotation: deg }))}
                    className={`w-12 h-8 rounded-lg text-xs font-bold transition-all ${
                      printOptions.rotation === deg
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>
            {/* Sharpness */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Ketajaman</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="100"
                  max="255"
                  value={printOptions.sharpness || 190}
                  onChange={(e) => setPrintOptions(prev => ({ ...prev, sharpness: parseInt(e.target.value) }))}
                  className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs font-bold text-gray-600 w-8">{printOptions.sharpness}</span>
              </div>
            </div>
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
                      style={{ transform: `rotate(${printOptions.rotation}deg)`, transformOrigin: 'center center' }}
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

        {/* Batch PDF Mode */}
        {printMode === 'batch' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Upload Multiple PDF</h2>

            {batchFiles.length === 0 ? (
              <div
                onClick={() => batchInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer"
              >
                <Layers className="w-10 h-10 text-gray-400" />
                <p className="text-sm text-gray-500 font-semibold">Klik untuk pilih beberapa PDF</p>
                <p className="text-xs text-gray-400">Bisa pilih multiple file sekaligus</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-700">{batchFiles.length} file dipilih</p>
                  <button
                    onClick={removeBatch}
                    className="text-xs text-red-500 font-semibold hover:text-red-700"
                  >
                    Hapus semua
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {batchFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <FileText className="w-5 h-5 text-red-500" />
                      <span className="text-xs text-gray-700 truncate flex-1">{file.name}</span>
                      <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <input
              ref={batchInputRef}
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleBatchChange}
              className="hidden"
            />

            {/* Print Button for Batch */}
            <button
              onClick={handlePrintBatch}
              disabled={batchFiles.length === 0 || printing}
              className="w-full mt-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              <Bluetooth className="w-4 h-4" />
              {printing ? (printProgress || "Mencetak...") : `Cetak ${batchFiles.length} PDF Sekaligus`}
            </button>
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
            <li>• <strong>1 PDF</strong>: Cetak satu PDF atau share ke Thermer</li>
            <li>• <strong>Batch PDF</strong>: Pilih beberapa PDF → cetak sekaligus</li>
            <li>• <strong>Gambar</strong>: Screenshot/foto → cetak langsung via Bluetooth</li>
            <li>• Rotasi default 90° (landscape)</li>
            <li>• Ketajaman default 190 (threshold hitam/putih)</li>
            <li>• Pairing printer dulu di Pengaturan Bluetooth HP</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
