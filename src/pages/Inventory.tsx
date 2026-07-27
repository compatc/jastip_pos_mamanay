import { useEffect, useState, useRef } from "react";
import { useStore } from "../stores/useStore";
import type { ProductDiscount } from "../types";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Package,
  ShoppingBag,
  Camera,
  History,
  TrendingUp,
  TrendingDown,
  Tag,
} from "lucide-react";

interface ProductForm {
  name: string;
  cost_price: string;
  sell_price: string;
  stock: string;
  unit: string;
  image: string;
}

const emptyForm: ProductForm = {
  name: "",
  cost_price: "",
  sell_price: "",
  stock: "",
  unit: "PCS",
  image: "",
};

export default function Inventory() {
  const {
    products,
    loadProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    stockMovements,
    loadStockMovements,
    productDiscounts,
    loadAllProductDiscounts,
    addProductDiscount,
    deleteProductDiscount,
  } = useStore();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "habis" | "ada">("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<
    string | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [discountProductId, setDiscountProductId] = useState<string | null>(null);
  const [discountMinQty, setDiscountMinQty] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");

  useEffect(() => {
    loadProducts();
    loadAllProductDiscounts();
  }, []);

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStock = stockFilter === "all" || (stockFilter === "habis" && p.stock === 0) || (stockFilter === "ada" && p.stock > 0);
    return matchSearch && matchStock;
  });

  function openHistory(productId: string) {
    setHistoryProductId(productId);
    loadStockMovements(productId);
  }

  function openAdd() {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(id: string) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditId(id);
    setForm({
      name: product.name,
      cost_price: product.cost_price.toString(),
      sell_price: product.sell_price.toString(),
      stock: product.stock.toString(),
      unit: product.unit || "PCS",
      image: product.image || "",
    });
    setShowForm(true);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert("Ukuran gambar maksimal 500KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm({ ...form, image: reader.result as string });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!form.name.trim()) return;

    try {
      if (editId) {
        await updateProduct(
          editId,
          form.name.trim(),
          parseFloat(form.cost_price) || 0,
          parseFloat(form.sell_price) || 0,
          parseInt(form.stock) || 0,
          form.unit.trim() || "PCS",
          form.image
        );
      } else {
        await addProduct(
          form.name.trim(),
          parseFloat(form.cost_price) || 0,
          parseFloat(form.sell_price) || 0,
          parseInt(form.stock) || 0,
          form.unit.trim() || "PCS",
          form.image
        );
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditId(null);
    } catch (err) {
      console.error("Submit error:", err);
      alert("Gagal menyimpan produk: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleDelete(id: string) {
    await deleteProduct(id);
    setDeleteConfirm(null);
  }

  const totalModal = filtered.reduce(
    (s, p) => s + p.cost_price * p.stock,
    0
  );
  const totalJual = filtered.reduce(
    (s, p) => s + p.sell_price * p.stock,
    0
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">

      <div className="shrink-0 px-5 pt-4 pb-3 relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk..."
              className="w-full pl-10 pr-4 py-3 bg-white/80 border border-pink-100 rounded-xl text-gray-700 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
            />
          </div>
          <button
            onClick={openAdd}
            className="w-28 shrink-0 px-4 py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl font-medium text-base flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-pink-200/40 active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" />
            Produk
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          {([
            { key: "all" as const, label: "Semua", count: products.length },
            { key: "ada" as const, label: "Ada Stok", count: products.filter((p) => p.stock > 0).length },
            { key: "habis" as const, label: "Stok Habis", count: products.filter((p) => p.stock === 0).length },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStockFilter(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                stockFilter === tab.key
                  ? tab.key === "habis" ? "bg-red-50 text-red-500 border border-red-200" : "bg-pink-50 text-pink-600 border border-pink-200"
                  : "bg-white/60 text-gray-400 border border-gray-100 hover:bg-white"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/80 border border-pink-100/60 rounded-xl p-3 text-center shadow-sm">
              <p className="text-base text-gray-400 uppercase tracking-widest mb-1">
                Total Item
              </p>
              <p className="text-base font-bold text-gray-700">
                {filtered.length}
              </p>
            </div>
            <div className="bg-white/80 border border-pink-100/60 rounded-xl p-3 text-center shadow-sm">
              <p className="text-base text-gray-400 uppercase tracking-widest mb-1">
                Total Modal
              </p>
              <p className="text-base font-bold text-amber-500">
                Rp. {totalModal.toLocaleString("id-ID")}
              </p>
            </div>
            <div className="bg-white/80 border border-pink-100/60 rounded-xl p-3 text-center shadow-sm">
              <p className="text-base text-gray-400 uppercase tracking-widest mb-1">
                Total Jual
              </p>
              <p className="text-base font-bold text-emerald-500">
                Rp. {totalJual.toLocaleString("id-ID")}
              </p>
            </div>
          </div>
        )}
      </div>

      <main className="px-5 py-4 relative z-10 flex-1 overflow-y-auto">

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-5">
              <Package className="w-8 h-8 text-pink-300" />
            </div>
            <p className="text-gray-500 text-2xl font-medium">
              Belum ada produk
            </p>
            <p className="text-gray-300 text-base mt-1">
              Tap "Produk" untuk menambah
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((product) => {
              const profit =
                product.sell_price - product.cost_price;
              return (
                <div
                  key={product.id}
                  className="bg-white/80 border border-pink-100/60 rounded-2xl p-5 group shadow-sm shadow-pink-50"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-10 h-10 rounded-xl object-cover border border-pink-100"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-pink-100 to-rose-100 border border-pink-200/50 rounded-xl flex items-center justify-center">
                          <ShoppingBag className="w-4 h-4 text-pink-400" />
                        </div>
                      )}
                      <div>
                        <p className="text-gray-800 font-semibold">
                          {product.name}
                        </p>
                        <p className="text-base text-gray-400 uppercase tracking-wider mt-0.5">
                          Laba:{" "}
                          <span
                            className={
                              profit >= 0
                                ? "text-emerald-500"
                                : "text-red-500"
                            }
                          >
                            {profit >= 0 ? "+" : ""}
                            Rp. {profit.toLocaleString("id-ID")}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {(() => {
                        const discounts = productDiscounts.filter((d) => d.product_id === product.id);
                        return (
                          <button
                            onClick={() => {
                              setDiscountProductId(product.id);
                              setDiscountMinQty("");
                              setDiscountPrice("");
                            }}
                            className={`p-2 rounded-lg transition-all relative ${discounts.length > 0 ? "bg-amber-50" : "hover:bg-amber-50"}`}
                            title="Atur Diskon"
                          >
                            <Tag className={`w-3.5 h-3.5 ${discounts.length > 0 ? "text-amber-500" : "text-gray-400 hover:text-amber-500"}`} />
                            {discounts.length > 0 && (
                              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                                {discounts.length}
                              </span>
                            )}
                          </button>
                        );
                      })()}
                      <button
                        onClick={() => openHistory(product.id)}
                        className="p-2 hover:bg-blue-50 rounded-lg transition-all"
                        title="Riwayat Stok"
                      >
                        <History className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                      </button>
                      <button
                        onClick={() =>
                          openEdit(product.id)
                        }
                        className="p-2 hover:bg-pink-50 rounded-lg transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-pink-500" />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteConfirm(product.id)
                        }
                        className="p-2 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-gray-300 hover:text-red-400" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="bg-pink-50/50 rounded-xl p-3 text-center border border-pink-100/60">
                      <p className="text-base text-gray-400 uppercase tracking-widest mb-1">
                        Modal
                      </p>
                      <p className="text-base text-gray-600 font-semibold">
                        Rp. {product.cost_price.toLocaleString(
                          "id-ID"
                        )}
                      </p>
                    </div>
                    <div className="bg-pink-50/50 rounded-xl p-3 text-center border border-pink-100/60">
                      <p className="text-base text-gray-400 uppercase tracking-widest mb-1">
                        Jual
                      </p>
                      <p className="text-base text-pink-500 font-semibold">
                        Rp. {product.sell_price.toLocaleString(
                          "id-ID"
                        )}
                      </p>
                    </div>
                    <div className="bg-pink-50/50 rounded-xl p-3 text-center border border-pink-100/60">
                      <p className="text-base text-gray-400 uppercase tracking-widest mb-1">
                        Stok
                      </p>
                      <p
                        className={`text-base font-bold ${
                          product.stock <= 0
                            ? "text-red-500"
                            : product.stock <= 5
                              ? "text-amber-500"
                              : "text-gray-700"
                        }`}
                      >
                        {product.stock}{" "}
                        <span className="text-base font-normal text-gray-400">
                          {product.unit}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/20 z-20 flex items-center justify-center">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl shadow-pink-100/50 mx-4 max-h-[85dvh] flex flex-col">
            <div className="px-6 pt-5 pb-3 shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">
                  {editId ? "Edit Produk" : "Tambah Produk"}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditId(null);
                  }}
                  className="p-2 hover:bg-pink-50 rounded-xl transition-all"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
            <form
              ref={formRef}
              action="#"
              onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }}
              className="flex-1 min-h-0 flex flex-col"
            >
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
              <div>
                <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                  Nama Produk
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="Nama produk"
                  className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                  required
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                    Harga Modal
                  </label>
                  <input
                    type="number"
                    value={form.cost_price}
                    onChange={(e) =>
                      setForm({ ...form, cost_price: e.target.value })
                    }
                    placeholder="0"
                    min="0"
                    className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                    Harga Jual
                  </label>
                  <input
                    type="number"
                    value={form.sell_price}
                    onChange={(e) =>
                      setForm({ ...form, sell_price: e.target.value })
                    }
                    placeholder="0"
                    min="0"
                    className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                  Stok
                </label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={(e) =>
                    setForm({ ...form, stock: e.target.value })
                  }
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                />
              </div>
              <div>
                <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                  Satuan
                </label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) =>
                    setForm({ ...form, unit: e.target.value })
                  }
                  placeholder="PCS"
                  className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                />
              </div>
              <div>
                <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                  Gambar Produk
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-pink-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:border-pink-300 hover:bg-pink-50/30 transition-all cursor-pointer min-h-[100px]"
                >
                  {form.image ? (
                    <div className="relative w-full">
                      <img
                        src={form.image}
                        alt="Preview"
                        className="w-24 h-24 object-cover rounded-xl mx-auto"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setForm({ ...form, image: "" });
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full p-1 hover:bg-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-pink-300" />
                      <span className="text-base text-pink-400 font-medium">
                        Tap untuk tambah gambar
                      </span>
                      <span className="text-base text-gray-400">
                        Maks 500KB
                      </span>
                    </>
                  )}
                </div>
              </div>
              {form.cost_price && form.sell_price && (
                <div className="bg-pink-50/60 border border-pink-100 rounded-2xl p-3">
                    <p className="text-base text-gray-400 uppercase tracking-widest mb-1">
                      Estimasi Keuntungan
                    </p>
                    <p
                      className={`text-xl font-bold ${
                      (parseFloat(form.sell_price) || 0) -
                        (parseFloat(form.cost_price) || 0) >=
                      0
                        ? "text-emerald-500"
                        : "text-red-500"
                    }`}
                  >
                    Rp{" "}
                    {(
                      (parseFloat(form.sell_price) || 0) -
                      (parseFloat(form.cost_price) || 0)
                    ).toLocaleString("id-ID")}
                  </p>
                </div>
              )}
              </div>
              <div className="shrink-0 px-6 py-3 bg-white border-t border-pink-100/60">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditId(null);
                    }}
                    className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-2xl transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    className="flex-1 py-3.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-pink-200/40"
                  >
                    {editId ? "Simpan" : "Tambah"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center p-4">
          <div className="bg-white border border-pink-100 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-pink-100/50">
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              Hapus Produk?
            </h3>
            <p className="text-gray-400 text-base mb-5">
              Produk ini akan dihapus permanen dari inventaris.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-2xl transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-red-200/30"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {historyProductId && (
        <div className="fixed inset-x-0 top-0 bottom-16 bg-black/20 backdrop-blur-sm z-30 flex items-end justify-center">
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 pb-6 shadow-2xl shadow-pink-100/50 border-t border-pink-100 max-h-[80vh] flex flex-col">
            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  Riwayat Stok
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {products.find((p) => p.id === historyProductId)?.name}
                </p>
              </div>
              <button
                onClick={() => setHistoryProductId(null)}
                className="p-2 hover:bg-pink-50 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {stockMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <History className="w-8 h-8 text-pink-300 mb-3" />
                <p className="text-gray-400 text-base">
                  Belum ada riwayat transaksi
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {stockMovements.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white border border-pink-100/60 rounded-2xl p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {m.transaction_type === "Pembelian" ? (
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center border border-red-100">
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          </div>
                        )}
                        <div>
                          <p className="text-base font-semibold text-gray-800">
                            {m.transaction_type === "Penyesuaian Stok"
                              ? "Penyesuaian Stok"
                              : m.transaction_type === "Pembelian"
                                ? `Supplier: ${m.party_name}`
                                : `Pelanggan: ${m.party_name}`}
                          </p>
                          <p className="text-xs text-gray-400">
                            {m.transaction_type} · No. {m.invoice_no}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(m.date).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between ml-10">
                      <span
                        className={`text-base font-bold ${
                          m.qty > 0
                            ? "text-emerald-500"
                            : "text-red-500"
                        }`}
                      >
                        {m.qty > 0 ? "+" : ""}
                        {m.qty} {m.unit}
                      </span>
                      <span className="text-sm text-gray-500">
                        Sisa: <span className="font-semibold text-gray-700">{m.qty_after}</span> {m.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {discountProductId && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div className="bg-white border border-pink-100 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-pink-100/50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Atur Diskon</h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {products.find((p) => p.id === discountProductId)?.name}
                </p>
              </div>
              <button
                onClick={() => setDiscountProductId(null)}
                className="p-2 hover:bg-pink-50 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {productDiscounts
                .filter((d) => d.product_id === discountProductId)
                .sort((a, b) => a.min_qty - b.min_qty)
                .map((d) => (
                  <div key={d.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <div>
                      <span className="text-sm font-semibold text-amber-700">
                        Beli {d.min_qty}+ → Rp {d.discount_price.toLocaleString("id-ID")}/pcs
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        await deleteProductDiscount(d.id, discountProductId!);
                      }}
                      className="p-1.5 hover:bg-red-100 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              {productDiscounts.filter((d) => d.product_id === discountProductId).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">Belum ada diskon</p>
              )}
            </div>

            <div className="border-t border-pink-100 pt-4">
              <p className="text-sm font-semibold text-gray-500 mb-3">Tambah Diskon Baru</p>
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Min Qty</label>
                  <input
                    type="number"
                    value={discountMinQty}
                    onChange={(e) => setDiscountMinQty(e.target.value)}
                    placeholder="3"
                    min="1"
                    className="w-full px-3 py-2.5 bg-pink-50/50 border border-pink-100 rounded-xl text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Harga Spesial</label>
                  <input
                    type="number"
                    value={discountPrice}
                    onChange={(e) => setDiscountPrice(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2.5 bg-pink-50/50 border border-pink-100 rounded-xl text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />
                </div>
              </div>
              <button
                onClick={async () => {
                  const minQty = parseInt(discountMinQty);
                  const price = parseFloat(discountPrice);
                  if (!minQty || minQty <= 0 || !price || price < 0 || !discountProductId) return;
                  try {
                    await addProductDiscount(discountProductId, minQty, price);
                    setDiscountMinQty("");
                    setDiscountPrice("");
                  } catch (err: any) {
                    alert("Gagal tambah diskon: " + (err.message || err));
                  }
                }}
                disabled={!discountMinQty || !discountPrice}
                className="w-full py-3 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-amber-200/40"
              >
                Tambah
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
