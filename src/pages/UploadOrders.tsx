import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import { uuid } from "../lib/uuid";
import type { OrderType, PaymentType } from "../types";
import { phoneEquals } from "../lib/phone";
import Papa from "papaparse";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle,
  Download,
  Loader2,
} from "lucide-react";

interface CsvRow {
  tanggal: string;
  pelanggan: string;
  telepon: string;
  produk: string;
  harga: string;
  jumlah: string;
  diskon: string;
  ongkir: string;
  tipe_bayar: string;
  tipe_order: string;
  catatan: string;
}

interface ValidatedRow extends CsvRow {
  rowIndex: number;
  product_id: string;
  errors: string[];
  warnings: string[];
}

interface OrderGroup {
  tanggal: string;
  pelanggan: string;
  telepon: string;
  ongkir: number;
  tipe_bayar: PaymentType;
  tipe_order: OrderType;
  catatan: string;
  items: ValidatedRow[];
}

type Step = "upload" | "preview" | "importing" | "done";

function formatRp(n: number): string {
  return n.toLocaleString("id-ID");
}

const TEMPLATE_CSV = `tanggal,pelanggan,telepon,produk,harga,jumlah,diskon,ongkir,tipe_bayar,tipe_order,catatan
2025-01-15,Budi,081234567890,Produk A,50000,2,0,10000,tf,penjualan,
2025-01-15,Budi,,Produk B,30000,1,5000,0,qris,penjualan,
2025-01-16,Andi,082198765432,Produk A,50000,5,0,15000,tf,pembelian,urgent`;

const PAYMENT_MAP: Record<string, PaymentType> = {
  tf: "tf",
  transfer: "tf",
  qris: "qris",
  split: "split",
  shopee: "shopee",
};

export default function UploadOrders() {
  const navigate = useNavigate();
  const { products, loadProducts, loadAllOrders, loadCustomers, customers } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [parsedRows, setParsedRows] = useState<ValidatedRow[]>([]);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importResult, setImportResult] = useState<{
    success: number;
    errors: { row: number; message: string }[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    loadProducts();
    loadCustomers();
  }, []);

  const downloadTemplate = useCallback(() => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_order.csv";
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
          const productMap = new Map(products.map((p) => [p.name.toLowerCase(), p]));

          const validated: ValidatedRow[] = results.data.map((row, i) => {
            const errors: string[] = [];
            const warnings: string[] = [];

            const tanggal = (row.tanggal || "").trim();
            const pelanggan = (row.pelanggan || "").trim();
            const telepon = (row.telepon || "").trim();
            const produk = (row.produk || "").trim();
            const hargaStr = (row.harga || "").trim();
            const jumlahStr = (row.jumlah || "").trim();
            const diskonStr = (row.diskon || "0").trim();
            const ongkirStr = (row.ongkir || "0").trim();
            const tipeBayar = (row.tipe_bayar || "tf").trim().toLowerCase();
            const tipeOrder = (row.tipe_order || "penjualan").trim().toLowerCase();
            const catatan = (row.catatan || "").trim();

            if (!tanggal) errors.push("Tanggal kosong");
            else if (isNaN(Date.parse(tanggal))) errors.push("Format tanggal salah (gunakan YYYY-MM-DD)");

            if (!pelanggan) errors.push("Nama pelanggan kosong");

            if (!telepon) errors.push("Telepon kosong");

            if (!produk) errors.push("Nama produk kosong");

            const harga = parseFloat(hargaStr);
            if (!hargaStr || isNaN(harga) || harga < 0) errors.push("Harga tidak valid");

            const jumlah = parseInt(jumlahStr, 10);
            if (!jumlahStr || isNaN(jumlah) || jumlah <= 0) errors.push("Jumlah harus > 0");

            const diskon = parseFloat(diskonStr) || 0;
            const ongkir = parseFloat(ongkirStr) || 0;

            if (!["tf", "transfer", "qris", "split", "shopee"].includes(tipeBayar)) {
              errors.push("Tipe bayar tidak valid (tf/qris/split/shopee)");
            }
            if (!["penjualan", "pembelian"].includes(tipeOrder)) {
              errors.push("Tipe order tidak valid (penjualan/pembelian)");
            }

            const product = produk ? productMap.get(produk.toLowerCase()) : null;
            let product_id = "";
            if (produk && !product) {
              errors.push(`Produk "${produk}" tidak ditemukan di inventaris`);
            } else if (product) {
              product_id = product.id;
              if (tipeOrder === "penjualan" && jumlah > product.stock) {
                warnings.push(`Stok ${product.name} hanya ${product.stock} ${product.unit}`);
              }
            }

            return {
              ...row,
              rowIndex: i + 2,
              product_id,
              errors,
              warnings,
            };
          });

          setParsedRows(validated);
          setStep("preview");
        },
      });
    },
    [products]
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

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const errorRows = parsedRows.filter((r) => r.errors.length > 0);
  const totalRows = parsedRows.length;

  function groupIntoOrders(rows: ValidatedRow[]): OrderGroup[] {
    const map = new Map<string, OrderGroup>();

    for (const row of rows) {
      const key = `${row.pelanggan.toLowerCase()}|${row.tanggal}`;
      if (!map.has(key)) {
        const tipeBayar = PAYMENT_MAP[row.tipe_bayar] || "tf";
        const tipeOrder = (["penjualan", "pembelian"].includes(row.tipe_order)
          ? row.tipe_order
          : "penjualan") as OrderType;
        map.set(key, {
          tanggal: row.tanggal,
          pelanggan: row.pelanggan,
          telepon: row.telepon || "",
          ongkir: row.ongkir ? parseFloat(row.ongkir) || 0 : 0,
          tipe_bayar: tipeBayar,
          tipe_order: tipeOrder,
          catatan: row.catatan || "",
          items: [],
        });
      }
      map.get(key)!.items.push(row);
    }

    return Array.from(map.values());
  }

  async function doImport() {
    const user = useStore.getState().user;
    if (!user?.id || user.auth_source === "offline") {
      setStep("upload");
      alert("Sesi login tidak valid. Silakan login ulang dulu.");
      return;
    }
    const orders = groupIntoOrders(validRows);
    setImportProgress({ done: 0, total: orders.length });
    setStep("importing");

    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (const group of orders) {
      try {
        const now = new Date().toISOString();
        const orderId = uuid();

        let customerId = "";
        let customerName = group.pelanggan.trim();
        const byName = customers.find(
          (c) => c.name.trim().toLowerCase() === customerName.toLowerCase()
        );
        const byPhone = group.telepon
          ? customers.find((c) => c.phone && phoneEquals(c.phone, group.telepon))
          : undefined;
        const existing = byName || byPhone;
        if (existing) {
          customerId = existing.id;
          customerName = existing.name;
        } else {
          customerId = uuid();
          await supabase.from("customers").insert({
            id: customerId,
            name: customerName,
            phone: group.telepon,
            address: "",
            category: group.tipe_order === "pembelian" ? "supplier" : "pelanggan",
            created_at: now,
          });
        }

        const subtotal = group.items.reduce(
          (sum, i) => sum + (parseFloat(i.harga) || 0) * (parseInt(i.jumlah) || 0) - (parseFloat(i.diskon) || 0),
          0
        );
        const orderTotal = subtotal + group.ongkir;

        const user = useStore.getState().user;
        const { error: orderError } = await supabase.from("orders").insert({
          id: orderId,
          customer_id: customerId,
          user_id: user?.id || "",
          status: "belum-ready",
          paid_total: 0,
          order_type: group.tipe_order,
          payment_type: group.tipe_bayar,
          ongkir: group.ongkir,
          notes: group.catatan,
          created_at: now,
          updated_at: now,
        });
        if (orderError) throw orderError;

        for (const row of group.items) {
          const itemId = uuid();
          const { error: itemError } = await supabase.from("order_items").insert({
            id: itemId,
            order_id: orderId,
            product_id: row.product_id,
            product_name: row.produk,
            price: parseFloat(row.harga) || 0,
            quantity: parseInt(row.jumlah) || 0,
            discount: parseFloat(row.diskon) || 0,
            paid_value: 0,
            status: "new",
          });
          if (itemError) {
            console.error("order_items insert error:", itemError);
            throw new Error(`Gagal simpan item "${row.produk}": ${itemError.message}`);
          }

          const { data: product } = await supabase
            .from("products")
            .select("id, stock, unit")
            .eq("id", row.product_id)
            .single();
          if (product) {
            const qty = parseInt(row.jumlah) || 0;
            const stockDelta = group.tipe_order === "penjualan" ? -qty : qty;
            const newStock = product.stock + stockDelta;
            await supabase
              .from("products")
              .update({ stock: newStock })
              .eq("id", product.id);

            const maxInvoice = await supabase
              .from("stock_movements")
              .select("invoice_no")
              .order("invoice_no", { ascending: false })
              .limit(1)
              .maybeSingle();
            const nextInvoice = ((maxInvoice?.data?.invoice_no as number) || 0) + 1;

            const txType = group.tipe_order === "penjualan" ? "Penjualan" : "Pembelian";
            await supabase.from("stock_movements").insert({
              id: uuid(),
              product_id: product.id,
              order_id: orderId,
              date: group.tanggal,
              transaction_type: txType,
              invoice_no: nextInvoice,
              party_name: customerName,
              qty: stockDelta,
              qty_after: newStock,
              unit: product.unit || "SET",
              created_at: now,
              unit_cost: null,
            });
          }
        }

        success++;
      } catch (err: any) {
        errors.push({ row: group.items[0]?.rowIndex || 0, message: err.message || "Gagal import" });
      }

      setImportProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setImportResult({ success, errors });
    setStep("done");
    await loadAllOrders();
    await loadProducts();
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
            onClick={() => navigate("/orders")}
            className="p-2.5 hover:bg-pink-50 rounded-xl transition-all border border-pink-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Upload CSV Orders</h1>
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
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">tanggal</td><td className="py-2 px-2 text-red-400">*</td><td className="py-2 px-2">YYYY-MM-DD</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">pelanggan</td><td className="py-2 px-2 text-red-400">*</td><td className="py-2 px-2">Nama pelanggan/supplier</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">telepon</td><td className="py-2 px-2 text-red-400">*</td><td className="py-2 px-2">Dipakai utk cocokkan pelanggan lama</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">produk</td><td className="py-2 px-2 text-red-400">*</td><td className="py-2 px-2">Harus sama dengan nama di inventaris</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">harga</td><td className="py-2 px-2 text-red-400">*</td><td className="py-2 px-2">Harga satuan</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">jumlah</td><td className="py-2 px-2 text-red-400">*</td><td className="py-2 px-2">Jumlah item</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">diskon</td><td className="py-2 px-2"></td><td className="py-2 px-2">Default 0</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">ongkir</td><td className="py-2 px-2"></td><td className="py-2 px-2">Ongkir per order, default 0</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">tipe_bayar</td><td className="py-2 px-2"></td><td className="py-2 px-2">tf / qris / split / shopee</td></tr>
                    <tr className="border-b border-pink-50"><td className="py-2 px-2 font-medium">tipe_order</td><td className="py-2 px-2"></td><td className="py-2 px-2">penjualan / pembelian</td></tr>
                    <tr><td className="py-2 px-2 font-medium">catatan</td><td className="py-2 px-2"></td><td className="py-2 px-2">Opsional</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Baris dengan pelanggan + tanggal sama akan digabung jadi 1 order.
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
                Import {validRows.length} Baris
              </button>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 bg-white/80 border border-pink-100/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-gray-800">{totalRows}</p>
                <p className="text-xs text-gray-400">Total Baris</p>
              </div>
              <div className="flex-1 bg-emerald-50/80 border border-emerald-100/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">{validRows.length}</p>
                <p className="text-xs text-emerald-400">Valid</p>
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

            {validRows.length > 0 && (
              <div className="bg-white/80 border border-pink-100/60 rounded-2xl overflow-hidden shadow-sm shadow-pink-50">
                <div className="p-4 border-b border-pink-100/60">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Preview Data Valid</h3>
                </div>
                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-pink-100">
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">#</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Tanggal</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Pelanggan</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Produk</th>
                        <th className="py-2 px-3 text-right text-gray-400 font-semibold">Harga</th>
                        <th className="py-2 px-3 text-right text-gray-400 font-semibold">Qty</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Tipe</th>
                        <th className="py-2 px-3 text-left text-gray-400 font-semibold">Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.map((row) => (
                        <tr key={row.rowIndex} className="border-b border-pink-50 hover:bg-pink-50/50">
                          <td className="py-2 px-3 text-gray-400">{row.rowIndex}</td>
                          <td className="py-2 px-3 text-gray-700">{row.tanggal}</td>
                          <td className="py-2 px-3 text-gray-700">{row.pelanggan}</td>
                          <td className="py-2 px-3 text-gray-700">{row.produk}</td>
                          <td className="py-2 px-3 text-gray-700 text-right">Rp {formatRp(parseFloat(row.harga) || 0)}</td>
                          <td className="py-2 px-3 text-gray-700 text-right">{row.jumlah}</td>
                          <td className="py-2 px-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${row.tipe_order === "penjualan" ? "bg-pink-100 text-pink-600" : "bg-amber-100 text-amber-600"}`}>
                              {row.tipe_order === "penjualan" ? "Jual" : "Beli"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-500 text-sm">{row.catatan || "-"}</td>
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
            <p className="text-gray-600 font-semibold text-lg">Mengimport orders...</p>
            <p className="text-gray-400 text-base mt-1">
              {importProgress.done} / {importProgress.total} order
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
              onClick={() => navigate("/orders")}
              className="w-full py-4 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-pink-200/40 active:scale-[0.98]"
            >
              Lihat Orders
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
