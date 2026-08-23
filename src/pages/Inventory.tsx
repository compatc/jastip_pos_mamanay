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
  Share2,
} from "lucide-react";

interface ProductForm {
  name: string;
  cost_price: string;
  sell_price: string;
  stock: string;
  unit: string;
  image: string;
  shopee_pcs: string;
}

const emptyForm: ProductForm = {
  name: "",
  cost_price: "",
  sell_price: "",
  stock: "",
  unit: "PCS",
  image: "",
  shopee_pcs: "1",
};

const avatarColors = [
  "from-pink-100 to-pink-200",
  "from-blue-100 to-blue-200",
  "from-green-100 to-green-200",
  "from-orange-100 to-orange-200",
  "from-purple-100 to-purple-200",
];

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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [discountProductId, setDiscountProductId] = useState<string | null>(null);
  const [discountMinQty, setDiscountMinQty] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [shareProductId, setShareProductId] = useState<string | null>(null);
  const [shareDesc, setShareDesc] = useState("");
  const [shareSending, setShareSending] = useState(false);

  useEffect(() => {
    loadProducts();
    loadAllProductDiscounts();
  }, []);

  const baseFiltered = products.filter((p) => {
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  const filtered = baseFiltered.filter((p) => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "habis") return p.stock === 0;
    if (categoryFilter === "rendah") return p.stock > 0 && p.stock <= 5;
    if (categoryFilter === "ada") return p.stock > 0;
    return true;
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
          form.image,
          parseInt(form.shopee_pcs) || 1
        );
      } else {
        await addProduct(
          form.name.trim(),
          parseFloat(form.cost_price) || 0,
          parseFloat(form.sell_price) || 0,
          parseInt(form.stock) || 0,
          form.unit.trim() || "PCS",
          form.image,
          parseInt(form.shopee_pcs) || 1
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

  const totalModal = filtered.reduce((s, p) => s + p.cost_price * p.stock, 0);
  const totalJual = filtered.reduce((s, p) => s + p.sell_price * p.stock, 0);

  const filters = [
    { key: "all", label: "Semua" },
    { key: "ada", label: "Ada Stok" },
    { key: "rendah", label: "Stok Rendah" },
    { key: "habis", label: "Stok Habis" },
  ];

  function getStockStatus(stock: number) {
    if (stock <= 0) return { label: "Habis", cls: "bg-red-100 text-red-600" };
    if (stock <= 5) return { label: `${stock}`, cls: "bg-amber-100 text-amber-600" };
    return { label: `${stock}`, cls: "bg-emerald-100 text-emerald-600" };
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      <div className="shrink-0 px-4 pt-3 pb-2 relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-base font-bold text-gray-800">📦 Inventaris</h1>
          <div className="flex-1" />
          <button
            onClick={openAdd}
            className="shrink-0 px-3 py-2 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shadow-lg shadow-pink-200/40 active:scale-[0.97]"
          >
            <Plus className="w-3.5 h-3.5" />
            Produk
          </button>
        </div>

        <div className="relative mb-2">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
          />
        </div>

        {filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <div className="bg-white border border-gray-100 rounded-lg py-1.5 text-center">
              <p className="text-sm font-extrabold text-pink-500">{filtered.length}</p>
              <p className="text-[9px] text-gray-400 font-medium leading-tight">Total Item</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-lg py-1.5 text-center">
              <p className="text-sm font-extrabold text-blue-500">
                {totalModal >= 1000000
                  ? `Rp ${(totalModal / 1000000).toFixed(1)}jt`
                  : totalModal >= 1000
                    ? `Rp ${(totalModal / 1000).toFixed(0)}rb`
                    : `Rp ${totalModal.toLocaleString("id-ID")}`}
              </p>
              <p className="text-[9px] text-gray-400 font-medium leading-tight">Total Modal</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-lg py-1.5 text-center">
              <p className="text-sm font-extrabold text-emerald-500">
                {totalJual >= 1000000
                  ? `Rp ${(totalJual / 1000000).toFixed(1)}jt`
                  : totalJual >= 1000
                    ? `Rp ${(totalJual / 1000).toFixed(0)}rb`
                    : `Rp ${totalJual.toLocaleString("id-ID")}`}
              </p>
              <p className="text-[9px] text-gray-400 font-medium leading-tight">Total Jual</p>
            </div>
          </div>
        )}

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setCategoryFilter(f.key)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-all ${
                categoryFilter === f.key
                  ? f.key === "habis"
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-pink-500 text-white border-pink-500"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <main className="px-4 py-2 relative z-10 flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-pink-50 border border-pink-100 rounded-2xl flex items-center justify-center mb-4">
              <Package className="w-7 h-7 text-pink-300" />
            </div>
            <p className="text-gray-500 text-base font-medium">Belum ada produk</p>
            <p className="text-gray-400 text-xs mt-1">Tap "+ Produk" untuk menambah</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((product, i) => {
              const profit = product.sell_price - product.cost_price;
              const discounts = productDiscounts.filter((d) => d.product_id === product.id);
              const stockStatus = getStockStatus(product.stock);
              const colorClass = avatarColors[i % avatarColors.length];

              return (
                <div
                  key={product.id}
                  className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-2xl shrink-0`}>
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                      <ShoppingBag className="w-5 h-5 text-pink-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-gray-800 truncate">{product.name}</p>
                      {discounts.length > 0 && (
                        <span className="text-[8px] px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded font-bold shrink-0">
                          Diskon
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{product.unit}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setDiscountProductId(product.id);
                            setDiscountMinQty("");
                            setDiscountPrice("");
                          }}
                          className="p-1 rounded hover:bg-amber-50 transition-all"
                          title="Atur Diskon"
                        >
                          <Tag className="w-3 h-3 text-gray-400 hover:text-amber-500" />
                        </button>
                        <button
                          onClick={() => openHistory(product.id)}
                          className="p-1 rounded hover:bg-blue-50 transition-all"
                          title="Riwayat Stok"
                        >
                          <History className="w-3 h-3 text-gray-400 hover:text-blue-500" />
                        </button>
                        <button
                          onClick={() => openEdit(product.id)}
                          className="p-1 rounded hover:bg-pink-50 transition-all"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3 text-gray-400 hover:text-pink-500" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(product.id)}
                          className="p-1 rounded hover:bg-red-50 transition-all"
                          title="Hapus"
                        >
                          <Trash2 className="w-3 h-3 text-gray-300 hover:text-red-400" />
                        </button>
                        <button
                          onClick={() => { setShareProductId(product.id); setShareDesc(""); }}
                          className="p-1 rounded hover:bg-green-50 transition-all"
                          title="Share ke Grup"
                        >
                          <Share2 className="w-3 h-3 text-gray-400 hover:text-green-500" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="text-sm font-bold text-pink-500">
                      Rp {product.sell_price.toLocaleString("id-ID")}
                    </p>
                    <p className="text-[10px] font-semibold text-emerald-500">
                      +Rp {profit.toLocaleString("id-ID")}
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${stockStatus.cls}`}>
                      {stockStatus.label}
                    </span>
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
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                    Nama Produk
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nama produk"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                      Harga Modal
                    </label>
                    <input
                      type="number"
                      value={form.cost_price}
                      onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                      placeholder="0"
                      min="0"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                      Harga Jual
                    </label>
                    <input
                      type="number"
                      value={form.sell_price}
                      onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                      placeholder="0"
                      min="0"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                      Stok
                    </label>
                    <input
                      type="number"
                      value={form.stock}
                      onChange={(e) => setForm({ ...form, stock: e.target.value })}
                      placeholder="0"
                      min="0"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                      Satuan
                    </label>
                    <input
                      type="text"
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      placeholder="PCS"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                      Shopee PCS
                    </label>
                    <input
                      type="number"
                      value={form.shopee_pcs}
                      onChange={(e) => setForm({ ...form, shopee_pcs: e.target.value })}
                      placeholder="1"
                      min="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
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
                    className="w-full border-2 border-dashed border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 hover:border-pink-300 hover:bg-pink-50/30 transition-all cursor-pointer min-h-[80px]"
                  >
                    {form.image ? (
                      <div className="relative">
                        <img src={form.image} alt="Preview" className="w-20 h-20 object-cover rounded-xl" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm({ ...form, image: "" });
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="absolute -top-1.5 -right-1.5 bg-red-400 text-white rounded-full p-0.5 hover:bg-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-pink-300" />
                        <span className="text-xs text-pink-400 font-medium">Tap untuk tambah gambar</span>
                        <span className="text-[10px] text-gray-400">Maks 500KB</span>
                      </>
                    )}
                  </div>
                </div>
                {form.cost_price && form.sell_price && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Estimasi Keuntungan</p>
                    <p className={`text-base font-bold ${
                      (parseFloat(form.sell_price) || 0) - (parseFloat(form.cost_price) || 0) >= 0
                        ? "text-emerald-500"
                        : "text-red-500"
                    }`}>
                      Rp {((parseFloat(form.sell_price) || 0) - (parseFloat(form.cost_price) || 0)).toLocaleString("id-ID")}
                    </p>
                  </div>
                )}
              </div>
              <div className="shrink-0 px-6 py-3 bg-white border-t border-gray-100">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditId(null); }}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-xl transition-all text-sm"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    className="flex-1 py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-pink-200/40 text-sm"
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
          <div className="bg-white border border-pink-100 rounded-2xl p-5 max-w-sm w-full shadow-2xl shadow-pink-100/50">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Hapus Produk?</h3>
            <p className="text-gray-400 text-sm mb-4">
              Produk ini akan dihapus permanen dari inventaris.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-xl transition-all text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-200/30 text-sm"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {historyProductId && (
        <div className="fixed inset-x-0 top-0 bottom-16 bg-black/20 backdrop-blur-sm z-30 flex items-end justify-center">
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-5 shadow-2xl shadow-pink-100/50 border-t border-pink-100 max-h-[80vh] flex flex-col">
            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Riwayat Stok</h2>
                <p className="text-xs text-gray-400 mt-0.5">
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
              <div className="flex flex-col items-center justify-center py-10">
                <History className="w-7 h-7 text-pink-300 mb-2" />
                <p className="text-gray-400 text-sm">Belum ada riwayat transaksi</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {stockMovements.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {m.transaction_type === "Pembelian" ? (
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center border border-red-100">
                            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {m.transaction_type === "Penyesuaian Stok"
                              ? "Penyesuaian Stok"
                              : m.transaction_type === "Pembelian"
                                ? `Supplier: ${m.party_name}`
                                : `Pelanggan: ${m.party_name}`}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {m.transaction_type} · No. {m.invoice_no}
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {new Date(m.date).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between ml-9">
                      <span className={`text-sm font-bold ${m.qty > 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {m.qty > 0 ? "+" : ""}{m.qty} {m.unit}
                      </span>
                      <span className="text-[10px] text-gray-500">
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
          <div className="bg-white border border-pink-100 rounded-2xl p-5 max-w-sm w-full shadow-2xl shadow-pink-100/50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-gray-800">Atur Diskon</h3>
                <p className="text-xs text-gray-400 mt-0.5">
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

            <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
              {productDiscounts
                .filter((d) => d.product_id === discountProductId)
                .sort((a, b) => a.min_qty - b.min_qty)
                .map((d) => (
                  <div key={d.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <span className="text-xs font-semibold text-amber-700">
                      Beli {d.min_qty}+ → Rp {d.discount_price.toLocaleString("id-ID")}/pcs
                    </span>
                    <button
                      onClick={async () => {
                        await deleteProductDiscount(d.id, discountProductId!);
                      }}
                      className="p-1 hover:bg-red-100 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                ))}
              {productDiscounts.filter((d) => d.product_id === discountProductId).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Belum ada diskon</p>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">Tambah Diskon Baru</p>
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Min Qty</label>
                  <input
                    type="number"
                    value={discountMinQty}
                    onChange={(e) => setDiscountMinQty(e.target.value)}
                    placeholder="3"
                    min="1"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Harga Spesial</label>
                  <input
                    type="number"
                    value={discountPrice}
                    onChange={(e) => setDiscountPrice(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-200"
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
                className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-amber-200/40 text-sm"
              >
                Tambah
              </button>
            </div>
          </div>
        </div>
      )}

      {shareProductId && (() => {
        const product = products.find((p) => p.id === shareProductId);
        if (!product) return null;
        const previewMsg = `🏷️ ${product.name} ${product.sell_price.toLocaleString("id-ID")}\n${shareDesc ? "\n" + shareDesc + "\n" : ""}[stok:${product.stock}]`;
        return (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-center justify-center p-4">
            <div className="bg-white border border-pink-100 rounded-2xl p-5 max-w-sm w-full shadow-2xl shadow-pink-100/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-800">Share ke Grup</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
                </div>
                <button onClick={() => setShareProductId(null)} className="p-2 hover:bg-pink-50 rounded-xl transition-all">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="mb-3">
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Deskripsi (opsional)</label>
                <textarea
                  value={shareDesc}
                  onChange={(e) => setShareDesc(e.target.value)}
                  placeholder="Sisir Catok Pelurus Rambut USB Rechargeable..."
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
                />
              </div>

              <div className="mb-3">
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Preview Pesan</label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {previewMsg}
                </div>
              </div>

              <button
                onClick={async () => {
                  setShareSending(true);
                  try {
                    const GROUP_ID = "120363404605912473@g.us";
                    const BOT_URL = import.meta.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
                    const res = await fetch(`${BOT_URL}/api/send-group`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
                      body: JSON.stringify({ group_jid: GROUP_ID, message: previewMsg }),
                    });
                    if (res.ok) {
                      alert("Berhasil dikirim ke grup!");
                      setShareProductId(null);
                    } else {
                      const data = await res.json();
                      alert("Gagal: " + (data.error || "Unknown error"));
                    }
                  } catch (err) {
                    alert("Gagal kirim: " + (err instanceof Error ? err.message : String(err)));
                  }
                  setShareSending(false);
                }}
                disabled={shareSending}
                className="w-full py-2.5 bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-200/40 text-sm"
              >
                {shareSending ? "Mengirim..." : "Kirim ke Grup"}
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
