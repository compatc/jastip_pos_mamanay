import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import { uuid } from "../lib/uuid";
import Papa from "papaparse";
import {
  ArrowLeft,
  Upload,
  Check,
  X,
  AlertTriangle,
  Download,
  Loader2,
} from "lucide-react";

interface CsvRow {
  nama: string;
  telepon: string;
  alamat: string;
  kategori: string;
}

interface ValidatedRow extends CsvRow {
  rowIndex: number;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
}

type Step = "upload" | "preview" | "importing" | "done";

const TEMPLATE_CSV = `nama,telepon,alamat,kategori
Budi Santoso,081234567890,Jl. Melati No. 12,
Andi Wijaya,082198765432,Jl. Kenanga No. 5,pelanggan
PT Sumber Makmur,083112233445,Jl. Raya Industri No. 1,supplier`;

export default function UploadCustomers() {
  const navigate = useNavigate();
  const { customers, loadCustomers } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [parsedRows, setParsedRows] = useState<ValidatedRow[]>([]);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importResult, setImportResult] = useState<{
    success: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const downloadTemplate = useCallback(() => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_pelanggan.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const parseFile = useCallback(
    (file: File) => {
      Papa.parse<CsvRow>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim().toLowerCase(),
        complete: (results) => {
          const existingNames = new Set(customers.map((c) => c.name.toLowerCase().trim()));
          const seen = new Set<string>();

          const validated: ValidatedRow[] = results.data.map((row, i) => {
            const errors: string[] = [];
            const warnings: string[] = [];

            const nama = (row.nama || "").trim();
            const telepon = (row.telepon || "").trim();
            const alamat = (row.alamat || "").trim();
            const kategoriRaw = (row.kategori || "").trim().toLowerCase();
            const kategori = kategoriRaw || "pelanggan";

            if (!nama) errors.push("Nama kosong");
            if (!telepon) errors.push("Telepon kosong");
            if (!["pelanggan", "supplier"].includes(kategori)) {
              errors.push("Kategori tidak valid (pelanggan/supplier)");
            }

            const key = nama.toLowerCase();
            let duplicate = false;
            if (nama && existingNames.has(key)) {
              duplicate = true;
              warnings.push("Sudah ada di database");
            }
            if (nama && seen.has(key)) {
              duplicate = true;
              warnings.push("Duplikat di dalam file");
            }
            seen.add(key);

            return {
              ...row,
              rowIndex: i + 2,
              errors,
              warnings,
              duplicate,
            };
          });

          setParsedRows(validated);
          setStep("preview");
        },
      });
    },
    [customers]
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        alert("Hanya file CSV yang diterima");
        return;
      }
      parseFile(file);
    },
    [parseFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const validRows = parsedRows.filter(
    (r) => r.errors.length === 0 && !r.duplicate
  );
  const errorRows = parsedRows.filter((r) => r.errors.length > 0);
  const skippedRows = parsedRows.filter(
    (r) => r.errors.length === 0 && r.duplicate
  );
  const totalRows = parsedRows.length;

  async function doImport() {
    setImportProgress({ done: 0, total: validRows.length });
    setStep("importing");

    let success = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];
    const insertedNames = new Set<string>();

    for (const row of validRows) {
      try {
        const existing = await supabase
          .from("customers")
          .select("id")
          .ilike("name", row.nama)
          .limit(1)
          .maybeSingle();
        if (existing.data || insertedNames.has(row.nama.toLowerCase())) {
          skipped++;
        } else {
          const { error } = await supabase.from("customers").insert({
            id: uuid(),
            name: row.nama,
            phone: row.telepon,
            address: row.alamat,
            category: row.kategori === "supplier" ? "supplier" : "pelanggan",
            created_at: new Date().toISOString(),
          });
          if (error) throw error;
          insertedNames.add(row.nama.toLowerCase());
          success++;
        }
      } catch (err: any) {
        errors.push({ row: row.rowIndex, message: err.message || "Gagal import" });
      }
      setImportProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setImportResult({ success, skipped, errors });
    setStep("done");
    await loadCustomers();
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-pink-50 via-white to-rose-50">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-200/30 rounded-full blur-3xl" />
      </div>

      <header className="shrink-0 bg-white/70 backdrop-blur-xl border-b border-pink-100/60 relative z-10">
        <div className="px-5 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2.5 hover:bg-pink-50 rounded-xl transition-all border border-pink-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Upload CSV Pelanggan</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative z-10 px-5 py-4">
        {step === "upload" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${
                dragOver
                  ? "border-pink-400 bg-pink-50"
                  : "border-pink-200 hover:border-pink-300 bg-white/60"
              }`}
            >
              <div className="w-16 h-16 bg-pink-50 border border-pink-100 rounded-2xl flex items-center justify-center mb-4">
                <Upload className="w-7 h-7 text-pink-400" />
              </div>
              <p className="text-gray-600 font-semibold text-lg mb-1">Seret file CSV ke sini</p>
              <p className="text-gray-400 text-base">atau klik untuk memilih file</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            <button
              onClick={downloadTemplate}
              className="w-full py-4 bg-white/80 border border-pink-100 hover:bg-pink-50 text-gray-600 font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all"
            >
              <Download className="w-5 h-5" />
              Download Template CSV
            </button>

            <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-5 shadow-sm shadow-pink-50">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Format CSV</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-pink-100">
                      <th className="py-2 px-2 text-left text-gray-400 font-semibold">Kolom</th>
                      <th className="py-2 px-2 text-left text-gray-400 font-semibold">Wajib</th>
                      <th className="py-2 px-2 text-left text-gray-400 font-semibold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600">
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">nama</td><td className="py-2 px-2 text-red-400">*</td><td className="py-2 px-2">Nama pelanggan/supplier</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">telepon</td><td className="py-2 px-2 text-red-400">*</td><td className="py-2 px-2">No. telepon</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">alamat</td><td className="py-2 px-2"></td><td className="py-2 px-2">Alamat, opsional</td></tr>
                    <tr><td className="py-2 px-2 font-medium">kategori</td><td className="py-2 px-2"></td><td className="py-2 px-2">pelanggan / supplier, default pelanggan</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Pelanggan dengan nama yang sudah ada di database akan dilewati.
              </p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                onClick={() => { setStep("upload"); setParsedRows([]); }}
                className="px-4 py-3 bg-white/80 border border-pink-100 hover:bg-pink-50 text-gray-600 font-semibold rounded-xl transition-all text-base"
              >
                Kembali
              </button>
              <button
                onClick={doImport}
                disabled={validRows.length === 0}
                className={`flex-1 py-3 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all ${
                  validRows.length > 0
                    ? "bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white shadow-lg shadow-pink-200/40 active:scale-[0.98]"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                <Check className="w-5 h-5" />
                Import {validRows.length} Pelanggan
              </button>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 bg-white/80 border border-pink-100/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-gray-800">{totalRows}</p>
                <p className="text-xs text-gray-400">Total Baris</p>
              </div>
              <div className="flex-1 bg-emerald-50/80 border border-emerald-100/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">{validRows.length}</p>
                <p className="text-xs text-emerald-400">Baru</p>
              </div>
              <div className="flex-1 bg-amber-50/80 border border-amber-100/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-500">{skippedRows.length}</p>
                <p className="text-xs text-amber-400">Dilewati</p>
              </div>
              <div className="flex-1 bg-red-50/80 border border-red-100/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-500">{errorRows.length}</p>
                <p className="text-xs text-red-400">Error</p>
              </div>
            </div>

            {errorRows.length > 0 && (
              <div className="bg-red-50/80 border border-red-100 rounded-2xl p-4">
                <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Baris Error
                </h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {errorRows.map((row) => (
                    <div key={row.rowIndex} className="text-sm">
                      <span className="font-semibold text-red-600">Baris {row.rowIndex}:</span>{" "}
                      <span className="text-red-500">{row.errors.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsedRows.length > 0 && (
              <div className="bg-white/80 border border-pink-100/60 rounded-2xl overflow-hidden shadow-sm shadow-pink-50">
                <div className="p-4 border-b border-pink-100/60">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Preview</h3>
                </div>
                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-pink-100">
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">#</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Nama</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Telepon</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Kategori</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row) => (
                        <tr key={row.rowIndex} className="border-b border-pink-50 hover:bg-pink-50/50">
                          <td className="py-2 px-3 text-gray-400">{row.rowIndex}</td>
                          <td className="py-2 px-3 text-gray-700">{row.nama}</td>
                          <td className="py-2 px-3 text-gray-700">{row.telepon || "-"}</td>
                          <td className="py-2 px-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${row.kategori === "supplier" ? "bg-amber-100 text-amber-600" : "bg-pink-100 text-pink-600"}`}>
                              {row.kategori === "supplier" ? "Supplier" : "Pelanggan"}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            {row.errors.length > 0 ? (
                              <span className="text-xs font-semibold text-red-500 flex items-center gap-1">
                                <X className="w-3.5 h-3.5" /> {row.errors.join(", ")}
                              </span>
                            ) : row.duplicate ? (
                              <span className="text-xs font-semibold text-amber-500 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Sudah ada
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" /> Siap import
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-pink-400 animate-spin mb-4" />
            <p className="text-gray-600 font-semibold text-lg">Mengimport pelanggan...</p>
            <p className="text-gray-400 text-base mt-1">
              {importProgress.done} / {importProgress.total}
            </p>
            <div className="w-64 h-2 bg-pink-100 rounded-full mt-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-pink-400 to-rose-500 rounded-full transition-all duration-300"
                style={{
                  width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {step === "done" && importResult && (
          <div className="space-y-4">
            <div className="bg-white/80 border border-pink-100/60 rounded-3xl p-8 text-center shadow-sm shadow-pink-50">
              <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Import Selesai!</h2>
              <div className="flex gap-3 justify-center mt-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{importResult.success}</p>
                  <p className="text-xs text-emerald-400">Berhasil</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-amber-500">{importResult.skipped}</p>
                  <p className="text-xs text-amber-400">Dilewati</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-red-500">{importResult.errors.length}</p>
                  <p className="text-xs text-red-400">Gagal</p>
                </div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="bg-red-50/80 border border-red-100 rounded-2xl p-4">
                <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Error Details
                </h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-semibold text-red-600">Baris {err.row}:</span>{" "}
                      <span className="text-red-500">{err.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => navigate("/")}
              className="w-full py-4 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-pink-200/40 active:scale-[0.98]"
            >
              Lihat Pelanggan
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
