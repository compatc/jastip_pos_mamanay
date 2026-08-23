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
  Layers,
} from "lucide-react";

interface ProductForm {
  name: string;
  description: string;
  cost_price: string;
  sell_price: string;
  stock: string;
  stock_type: "ready" | "po";
  unit: string;
  image: string;
  shopee_pcs: string;
}

const emptyForm: ProductForm = {
  name: "",
  description: "",
  cost_price: "",
  sell_price: "",
  stock: "",
  stock_type: "ready",
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
    variantStock,
    loadVariantStock,
    productVariants,
    loadProductVariants,
    addProductVariant,
    updateProductVariant,
    deleteProductVariant,
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
  const [shareVariantId, setShareVariantId] = useState<string | null>(null);
  const [variantProductId, setVariantProductId] = useState<string | null>(null);
  const [variantName, setVariantName] = useState("");
  const [variantImage, setVariantImage] = useState("");
  const [variantStockInput, setVariantStockInput] = useState("");
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantStockType, setVariantStockType] = useState<"ready" | "po">("ready");
  const variantFileRef = useRef<HTMLInputElement>(null);
  const formVariantNameRef = useRef<HTMLInputElement>(null);
  const [formVariants, setFormVariants] = useState<{ name: string; image: string; stock: string; stock_type: "ready" | "po" }[]>([]);
  const [formVariantName, setFormVariantName] = useState("");
  const [formVariantImage, setFormVariantImage] = useState("");
  const [formVariantStock, setFormVariantStock] = useState("");
  const [formVariantStockType, setFormVariantStockType] = useState<"ready" | "po">("ready");
  const [bulkSelect, setBulkSelect] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ sent: 0, total: 0 });

  useEffect(() => {
    loadProducts();
    loadAllProductDiscounts();
    loadVariantStock();
  }, []);

  useEffect(() => {
    if (variantProductId) loadProductVariants(variantProductId);
  }, [variantProductId]);

  const baseFiltered = products.filter((p) => {
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  const filtered = baseFiltered.filter((p) => {
    if (categoryFilter === "all") return true;
    const vs = variantStock[p.id];
    const hasVariants = vs && Object.keys(vs).length > 0;
    const realStock = hasVariants
      ? Object.values(vs).reduce((a, b) => a + Math.max(0, b), 0)
      : p.stock;
    if (categoryFilter === "habis") return realStock === 0;
    if (categoryFilter === "rendah") return realStock > 0 && realStock <= 5;
    if (categoryFilter === "ada") return realStock > 0;
    return true;
  });

  function openHistory(productId: string) {
    setHistoryProductId(productId);
    loadStockMovements(productId);
  }

  function openAdd() {
    setEditId(null);
    setForm(emptyForm);
    setFormVariants([]);
    setShowForm(true);
  }

  function openEdit(id: string) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditId(id);
    setForm({
      name: product.name,
      description: (product as any).description || "",
      cost_price: product.cost_price.toString(),
      sell_price: product.sell_price.toString(),
      stock: product.stock.toString(),
      stock_type: (product as any).stock_type || "ready",
      unit: product.unit || "PCS",
      image: product.image || "",
    });
    setFormVariants([]);
    loadProductVariants(id);
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
      let productId = editId;
      if (editId) {
        await updateProduct(
          editId,
          form.name.trim(),
          parseFloat(form.cost_price) || 0,
          parseFloat(form.sell_price) || 0,
          parseInt(form.stock) || 0,
          form.unit.trim() || "PCS",
          form.image,
          parseInt(form.shopee_pcs) || 1,
          form.stock_type,
          form.description.trim()
        );
      } else {
        productId = await addProduct(
          form.name.trim(),
          parseFloat(form.cost_price) || 0,
          parseFloat(form.sell_price) || 0,
          parseInt(form.stock) || 0,
          form.unit.trim() || "PCS",
          form.image,
          parseInt(form.shopee_pcs) || 1,
          form.stock_type,
          form.description.trim()
        );
      }

      // Save new variants from form
      if (productId && formVariants.length > 0) {
        for (const v of formVariants) {
          await addProductVariant(productId, v.name, v.image, parseInt(v.stock) || 0, v.stock_type);
        }
        loadVariantStock();
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditId(null);
      setFormVariants([]);
      setFormVariantName("");
      setFormVariantImage("");
      setFormVariantStock("");
    } catch (err) {
      console.error("Submit error:", err);
      alert("Gagal menyimpan produk: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleDelete(id: string) {
    await deleteProduct(id);
    setDeleteConfirm(null);
  }

  function handleVariantImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert("Ukuran gambar maksimal 500KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setVariantImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleFormVariantImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert("Ukuran gambar maksimal 500KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFormVariantImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function addFormVariant() {
    if (!formVariantName.trim()) return;
    setFormVariants([...formVariants, { name: formVariantName.trim(), image: formVariantImage, stock: formVariantStock || "0", stock_type: formVariantStockType }]);
    setFormVariantName("");
    setFormVariantImage("");
    setFormVariantStock("");
    setFormVariantStockType("ready");
  }

  function removeFormVariant(idx: number) {
    setFormVariants(formVariants.filter((_, i) => i !== idx));
  }

  async function handleAddVariant() {
    if (!variantProductId || !variantName.trim()) return;
    try {
      if (editingVariantId) {
        await updateProductVariant(editingVariantId, variantName.trim(), variantImage, parseInt(variantStockInput) || 0, variantStockType);
      } else {
        await addProductVariant(variantProductId, variantName.trim(), variantImage, parseInt(variantStockInput) || 0, variantStockType);
      }
      setVariantName("");
      setVariantImage("");
      setVariantStockInput("");
      setEditingVariantId(null);
      loadProductVariants(variantProductId);
      loadVariantStock();
    } catch (err) {
      alert("Gagal: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleDeleteVariant(id: string) {
    if (!variantProductId) return;
    await deleteProductVariant(id);
    loadProductVariants(variantProductId);
    loadVariantStock();
  }

  function startEditVariant(v: { id: string; name: string; image: string; stock: number; stock_type?: string | null }) {
    setEditingVariantId(v.id);
    setVariantName(v.name);
    setVariantImage(v.image || "");
    setVariantStockInput(v.stock.toString());
    setVariantStockType((v.stock_type as "ready" | "po") || "ready");
  }

  const totalModal = filtered.reduce((s, p) => {
    const vs = variantStock[p.id];
    const hasVariants = vs && Object.keys(vs).length > 0;
    const realStock = hasVariants ? Object.values(vs).reduce((a, b) => a + Math.max(0, b), 0) : p.stock;
    return s + p.cost_price * realStock;
  }, 0);
  const totalJual = filtered.reduce((s, p) => {
    const vs = variantStock[p.id];
    const hasVariants = vs && Object.keys(vs).length > 0;
    const realStock = hasVariants ? Object.values(vs).reduce((a, b) => a + Math.max(0, b), 0) : p.stock;
    return s + p.sell_price * realStock;
  }, 0);

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

  async function bulkSendToGroup() {
    if (selectedProducts.size === 0) return;
    setBulkSending(true);
    const GROUP_ID = "120363404605912473@g.us";
    const BOT_URL = import.meta.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
    const ids = Array.from(selectedProducts);
    setBulkProgress({ sent: 0, total: ids.length });
    let sent = 0;

    for (const pid of ids) {
      const product = products.find((p) => p.id === pid);
      if (!product) continue;
      const vs = variantStock[pid];
      const hasVariants = vs && Object.keys(vs).length > 0;
      const stType = (product as any).stock_type === "po" ? " [PO]" : "";
      const desc = (product as any).description || "";
      const footer = "\n\n_Fix, reply difoto_";

      try {
        if (hasVariants) {
          const entries = Object.entries(vs).filter(([, qty]) => qty > 0);
          const lines = entries.map(([v, qty]) => `• ${v} [stok:${qty}]`).join("\n");
          const msg = `🏷️ ${product.name}${stType} ${product.sell_price.toLocaleString("id-ID")}\n${desc ? "\n" + desc + "\n" : ""}${lines}${footer}`;
          if (product.image) {
            const fd = new FormData();
            fd.append("group_jid", GROUP_ID);
            fd.append("message", msg);
            const res = await fetch(product.image);
            const blob = await res.blob();
            fd.append("image", blob, "product.jpg");
            await fetch(`${BOT_URL}/api/send-group`, { method: "POST", headers: { Authorization: "Bearer mamanay2026" }, body: fd });
          } else {
            await fetch(`${BOT_URL}/api/send-group`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" }, body: JSON.stringify({ group_jid: GROUP_ID, message: msg }) });
          }
        } else {
          const stockInfo = getStockStatus(product.stock);
          const msg = `🏷️ ${product.name}${stType} ${product.sell_price.toLocaleString("id-ID")}\n${desc ? "\n" + desc + "\n" : ""}[stok:${product.stock}]${footer}`;
          if (product.image) {
            const fd = new FormData();
            fd.append("group_jid", GROUP_ID);
            fd.append("message", msg);
            const res = await fetch(product.image);
            const blob = await res.blob();
            fd.append("image", blob, "product.jpg");
            await fetch(`${BOT_URL}/api/send-group`, { method: "POST", headers: { Authorization: "Bearer mamanay2026" }, body: fd });
          } else {
            await fetch(`${BOT_URL}/api/send-group`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" }, body: JSON.stringify({ group_jid: GROUP_ID, message: msg }) });
          }
        }
        sent++;
        setBulkProgress({ sent, total: ids.length });
      } catch (err) {
        console.error("Bulk send error:", product.name, err);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    alert(`Selesai! ${sent}/${ids.length} produk terkirim ke grup.`);
    setBulkSelect(false);
    setSelectedProducts(new Set());
    setBulkSending(false);
    setBulkProgress({ sent: 0, total: 0 });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      <div className="shrink-0 px-4 pt-3 pb-2 relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-base font-bold text-gray-800">📦 Inventaris</h1>
          <div className="flex-1" />
          <button
            onClick={() => { setBulkSelect(!bulkSelect); setSelectedProducts(new Set()); }}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all active:scale-[0.97] ${
              bulkSelect
                ? "bg-green-500 text-white shadow-lg shadow-green-200/40"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            {bulkSelect ? `Kirim (${selectedProducts.size})` : "Massal"}
          </button>
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
              const vs = variantStock[product.id];
              const hasVariants = vs && Object.keys(vs).length > 0;
              const displayStock = hasVariants
                ? Object.values(vs).reduce((a, b) => a + Math.max(0, b), 0)
                : product.stock;
              const stockStatus = getStockStatus(displayStock);
              const colorClass = avatarColors[i % avatarColors.length];

              return (
                <div
                  key={product.id}
                  className={`flex items-center gap-3 bg-white border rounded-xl p-2.5 shadow-sm transition-all ${
                    bulkSelect && selectedProducts.has(product.id)
                      ? "border-green-400 bg-green-50"
                      : "border-gray-100"
                  }`}
                  onClick={bulkSelect ? () => {
                    setSelectedProducts((prev) => {
                      const next = new Set(prev);
                      if (next.has(product.id)) next.delete(product.id);
                      else next.add(product.id);
                      return next;
                    });
                  } : undefined}
                >
                  {bulkSelect && (
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      selectedProducts.has(product.id)
                        ? "bg-green-500 border-green-500"
                        : "border-gray-300"
                    }`}>
                      {selectedProducts.has(product.id) && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      )}
                    </div>
                  )}
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
                    {(() => {
                      const vs = variantStock[product.id];
                      if (!vs || Object.keys(vs).length === 0) return null;
                      const entries = Object.entries(vs).filter(([, qty]) => qty > 0);
                      if (entries.length === 0) return null;
        return (
                        <button
                          onClick={() => setVariantProductId(product.id)}
                          className="flex flex-wrap gap-1 mt-1.5"
                        >
                          {entries.map(([v, qty]) => (
                            <span key={v} className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-semibold hover:bg-pink-100 hover:text-pink-600 transition-all cursor-pointer">
                              {v} <span className="text-gray-800">{qty}</span>
                            </span>
                          ))}
                        </button>
                      );
                    })()}
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
                          onClick={() => { setShareProductId(product.id); setShareDesc((product as any).description || ""); setShareVariantId(null); loadProductVariants(product.id); }}
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
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${(product as any).stock_type === "po" ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
                      {(product as any).stock_type === "po" ? "PO" : "Ready"}
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
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                    Deskripsi
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Deskripsi produk (opsional)"
                    rows={2}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all resize-none"
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
                    Tipe Stok
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, stock_type: "ready" })}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                        form.stock_type === "ready"
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      Ready
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, stock_type: "po" })}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                        form.stock_type === "po"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      PO
                    </button>
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
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                    Varian Produk
                  </label>
                  {editId && productVariants.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {productVariants.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                          {v.image ? (
                            <img src={v.image} alt={v.name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-pink-100 flex items-center justify-center shrink-0">
                              <ShoppingBag className="w-3.5 h-3.5 text-pink-400" />
                            </div>
                          )}
                          <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{v.name}</span>
                          <span className="text-[10px] text-gray-400">stok: {v.stock}</span>
                          <button
                            type="button"
                            onClick={async () => { await deleteProductVariant(v.id); loadProductVariants(editId!); loadVariantStock(); }}
                            className="p-1 hover:bg-red-100 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {formVariants.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {formVariants.map((v, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-pink-50 border border-pink-100 rounded-lg px-3 py-2">
                          {v.image ? (
                            <img src={v.image} alt={v.name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-pink-100 flex items-center justify-center shrink-0">
                              <ShoppingBag className="w-3.5 h-3.5 text-pink-400" />
                            </div>
                          )}
                          <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{v.name}</span>
                          <span className="text-[10px] text-gray-400">stok: {v.stock}</span>
                          <button
                            type="button"
                            onClick={() => removeFormVariant(idx)}
                            className="p-1 hover:bg-red-100 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formVariantName}
                        onChange={(e) => setFormVariantName(e.target.value)}
                        placeholder="Nama varian"
                        className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                      <input
                        type="number"
                        value={formVariantStock}
                        onChange={(e) => setFormVariantStock(e.target.value)}
                        placeholder="Stok"
                        min="0"
                        className="w-16 shrink-0 px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                      <div className="flex shrink-0">
                        <button
                          type="button"
                          onClick={() => setFormVariantStockType(formVariantStockType === "ready" ? "po" : "ready")}
                          className={`px-2 py-2 rounded-lg text-[10px] font-bold border transition-all ${
                            formVariantStockType === "po"
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-emerald-500 text-white border-emerald-500"
                          }`}
                        >
                          {formVariantStockType === "po" ? "PO" : "R"}
                        </button>
                      </div>
                      <input
                        ref={formVariantNameRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFormVariantImageUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => formVariantNameRef.current?.click()}
                        className="shrink-0 px-2 py-2 border border-gray-200 rounded-lg hover:bg-pink-50 transition-all"
                      >
                        <Camera className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      <button
                        type="button"
                        onClick={addFormVariant}
                        disabled={!formVariantName.trim()}
                        className="shrink-0 px-3 py-2 bg-pink-100 hover:bg-pink-200 disabled:bg-gray-100 disabled:text-gray-300 text-pink-600 rounded-lg transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {formVariantImage && (
                    <div className="relative inline-block mt-2">
                      <img src={formVariantImage} alt="Preview" className="w-10 h-10 rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => setFormVariantImage("")}
                        className="absolute -top-1 -right-1 bg-red-400 text-white rounded-full p-0.5 hover:bg-red-500"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
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
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${m.qty > 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {m.qty > 0 ? "+" : ""}{m.qty} {m.unit}
                        </span>
                        {m.variant ? (
                          <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-semibold">
                            {m.variant}
                          </span>
                        ) : null}
                      </div>
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
        const variants = productVariants.filter((v) => v.product_id === shareProductId);
        const selectedVariant = shareVariantId ? variants.find((v) => v.id === shareVariantId) : null;
        const displayStock = selectedVariant ? selectedVariant.stock : product.stock;
        const displayName = selectedVariant ? `${product.name} ${selectedVariant.name}` : product.name;
        const isAllSelected = !shareVariantId && variants.length > 0;
        const shareImage = isAllSelected
          ? (variants.some((v) => v.image) ? "" : product.image || "")
          : (selectedVariant?.image || product.image || "");
        const stockTypeBadge = (product as any).stock_type === "po" ? " [PO]" : "";
        const footer = "\n\n_Fix, reply difoto_";
        const previewMsg = isAllSelected
          ? `🏷️ ${product.name}${stockTypeBadge} ${product.sell_price.toLocaleString("id-ID")}\n${shareDesc ? "\n" + shareDesc + "\n" : ""}${variants.map((v) => `• ${v.name} [stok:${v.stock}]`).join("\n")}${footer}`
          : `🏷️ ${displayName}${stockTypeBadge} ${product.sell_price.toLocaleString("id-ID")}\n${shareDesc ? "\n" + shareDesc + "\n" : ""}[stok:${displayStock}]${footer}`;
        return (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-center justify-center p-4">
            <div className="bg-white border border-pink-100 rounded-2xl p-5 max-w-sm w-full shadow-2xl shadow-pink-100/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-800">Share ke Grup</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
                </div>
                <button onClick={() => { setShareProductId(null); setShareVariantId(null); }} className="p-2 hover:bg-pink-50 rounded-xl transition-all">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {variants.length > 0 && (
                <div className="mb-3">
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Pilih Varian</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setShareVariantId(null)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                        !shareVariantId ? "bg-pink-500 text-white border-pink-500" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      Semua
                    </button>
                    {variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setShareVariantId(v.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                          shareVariantId === v.id ? "bg-pink-500 text-white border-pink-500" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {v.name} ({v.stock})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {shareImage && (
                <div className="mb-3 flex justify-center">
                  <img src={shareImage} alt={displayName} className="w-20 h-20 rounded-xl object-cover border border-gray-100" />
                </div>
              )}

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
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Preview di Grup</label>
                <div className="bg-[#e5ddd5] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9InAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJyZ2JhKDAsMCwwLDAuMDMpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI3ApIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiLz48L3N2Zz4=')] rounded-xl p-3 min-h-[120px]">
                  <div className="bg-white rounded-xl shadow-sm max-w-[85%] ml-auto overflow-hidden">
                    {shareImage && (
                      <img src={shareImage} alt={displayName} className="w-full h-32 object-cover" />
                    )}
                    <div className="px-2.5 py-1.5">
                      <p className="text-[11px] text-gray-800 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: previewMsg.replace(/_([^_]+)_/g, '<em>$1</em>') }} />
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <span className="text-[9px] text-gray-400">12:00</span>
                        <svg className="w-3 h-3 text-blue-400" viewBox="0 0 16 11" fill="currentColor"><path d="M11.071.653a.457.457 0 0 0-.304-.102-.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.46.46 0 0 0-.353-.146.457.457 0 0 0-.331.136.448.448 0 0 0-.14.339c0 .136.046.255.14.351l2.365 2.44a.463.463 0 0 0 .353.146c.14 0 .27-.046.38-.14l6.545-8.091a.448.448 0 0 0 .1-.362.448.448 0 0 0-.155-.33l-.018-.012z"/><path d="M14.757.148a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102l-.018.012a.448.448 0 0 0-.155.33c0 .142.034.27.1.362l6.545 8.091a.517.517 0 0 0 .38.14c.14 0 .27-.046.353-.14l2.365-2.44a.455.455 0 0 0 .14-.351.448.448 0 0 0-.14-.339.457.457 0 0 0-.331-.136.46.46 0 0 0-.353.146l-2.011 2.095-6.19-7.636z" opacity=".5"/></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={async () => {
                  setShareSending(true);
                  try {
                    const GROUP_ID = "120363404605912473@g.us";
                    const BOT_URL = import.meta.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
                    const hasImage = !!shareImage;
                    if (hasImage) {
                      const fd = new FormData();
                      fd.append("group_jid", GROUP_ID);
                      fd.append("message", previewMsg);
                      const res = await fetch(shareImage);
                      const blob = await res.blob();
                      fd.append("image", blob, "variant.jpg");
                      const r = await fetch(`${BOT_URL}/api/send-group`, {
                        method: "POST",
                        headers: { Authorization: "Bearer mamanay2026" },
                        body: fd,
                      });
                      if (r.ok) {
                        alert("Berhasil dikirim ke grup!");
                        setShareProductId(null);
                        setShareVariantId(null);
                      } else {
                        const d = await r.json();
                        alert("Gagal: " + (d.error || "Unknown error"));
                      }
                    } else {
                      const res = await fetch(`${BOT_URL}/api/send-group`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
                        body: JSON.stringify({ group_jid: GROUP_ID, message: previewMsg }),
                      });
                      if (res.ok) {
                        alert("Berhasil dikirim ke grup!");
                        setShareProductId(null);
                        setShareVariantId(null);
                      } else {
                        const d = await res.json();
                        alert("Gagal: " + (d.error || "Unknown error"));
                      }
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
              {variants.length > 1 && !shareVariantId && (
                <button
                  onClick={async () => {
                    setShareSending(true);
                    try {
                      const GROUP_ID = "120363404605912473@g.us";
                      const BOT_URL = import.meta.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
                      const hasAnyVariantImage = variants.some((v) => v.image);

                      if (hasAnyVariantImage) {
                        // Ada varian yang punya foto → kirim terpisah per varian
                        const sendable = variants.filter((v) => v.image);
                        let sent = 0;
                        for (const v of sendable) {
                          const stType = (product as any).stock_type === "po" ? " [PO]" : "";
                          const msg = `🏷️ ${product.name} ${v.name}${stType} ${product.sell_price.toLocaleString("id-ID")}\n${shareDesc ? "\n" + shareDesc + "\n" : ""}[stok:${v.stock}]\n\n_Fix, reply difoto_`;
                          const fd = new FormData();
                          fd.append("group_jid", GROUP_ID);
                          fd.append("message", msg);
                          const res = await fetch(v.image);
                          const blob = await res.blob();
                          fd.append("image", blob, "variant.jpg");
                          const r = await fetch(`${BOT_URL}/api/send-group`, {
                            method: "POST",
                            headers: { Authorization: "Bearer mamanay2026" },
                            body: fd,
                          });
                          if (r.ok) sent++;
                          await new Promise((r) => setTimeout(r, 1500));
                        }
                        alert(`Terkirim ${sent}/${sendable.length} varian ke grup!`);
                      } else {
                        // Tidak ada foto varian → 1 bubble gabungan + foto produk
                        const lines = variants.map((v) => `• ${v.name} [stok:${v.stock}]`).join("\n");
                        const stType2 = (product as any).stock_type === "po" ? " [PO]" : "";
                        const msg = `🏷️ ${product.name}${stType2} ${product.sell_price.toLocaleString("id-ID")}\n${shareDesc ? "\n" + shareDesc + "\n" : ""}${lines}\n\n_Fix, reply difoto_`;
                        if (product.image) {
                          const fd = new FormData();
                          fd.append("group_jid", GROUP_ID);
                          fd.append("message", msg);
                          const res = await fetch(product.image);
                          const blob = await res.blob();
                          fd.append("image", blob, "product.jpg");
                          await fetch(`${BOT_URL}/api/send-group`, {
                            method: "POST",
                            headers: { Authorization: "Bearer mamanay2026" },
                            body: fd,
                          });
                        } else {
                          await fetch(`${BOT_URL}/api/send-group`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
                            body: JSON.stringify({ group_jid: GROUP_ID, message: msg }),
                          });
                        }
                        alert("Terkirim 1 pesan gabungan ke grup!");
                      }
                      setShareProductId(null);
                      setShareVariantId(null);
                    } catch (err) {
                      alert("Gagal: " + (err instanceof Error ? err.message : String(err)));
                    }
                    setShareSending(false);
                  }}
                  disabled={shareSending}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-400 to-indigo-500 hover:from-blue-500 hover:to-indigo-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-200/40 text-sm mt-2"
                >
                  {shareSending ? "Mengirim semua..." : `Kirim Semua Varian (${variants.length})`}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {variantProductId && (() => {
        const product = products.find((p) => p.id === variantProductId);
        if (!product) return null;
        return (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-center justify-center p-4">
            <div className="bg-white border border-pink-100 rounded-2xl p-5 max-w-sm w-full shadow-2xl shadow-pink-100/50 max-h-[80dvh] flex flex-col">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div>
                  <h3 className="text-base font-bold text-gray-800">Kelola Varian</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
                </div>
                <button onClick={() => { setVariantProductId(null); setEditingVariantId(null); setVariantName(""); setVariantImage(""); setVariantStockInput(""); setVariantStockType("ready"); }} className="p-2 hover:bg-pink-50 rounded-xl transition-all">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto mb-3 space-y-1.5">
                {productVariants.length === 0 ? (
                  <div className="text-center py-4">
                    <Layers className="w-6 h-6 text-pink-300 mx-auto mb-1" />
                    <p className="text-xs text-gray-400">Belum ada varian</p>
                  </div>
                ) : (
                  productVariants.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                      {v.image ? (
                        <img src={v.image} alt={v.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center shrink-0">
                          <ShoppingBag className="w-4 h-4 text-pink-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{v.name}</p>
                        <p className="text-[10px] text-gray-400">Stok: {v.stock}</p>
                      </div>
                      <button onClick={() => startEditVariant(v)} className="p-1 hover:bg-blue-100 rounded-lg transition-all">
                        <Pencil className="w-3 h-3 text-blue-400" />
                      </button>
                      <button onClick={() => handleDeleteVariant(v.id)} className="p-1 hover:bg-red-100 rounded-lg transition-all">
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="shrink-0 border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500">{editingVariantId ? "Edit Varian" : "Tambah Varian"}</p>
                <input
                  type="text"
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="Nama varian (contoh: Pink, 500ml)"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
                <div className="space-y-1.5">
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      value={variantStockInput}
                      onChange={(e) => setVariantStockInput(e.target.value)}
                      placeholder="Stok"
                      min="0"
                      className="w-16 shrink-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-200"
                    />
                    <button
                      type="button"
                      onClick={() => setVariantStockType(variantStockType === "ready" ? "po" : "ready")}
                      className={`shrink-0 px-2.5 py-2 rounded-lg text-[10px] font-bold border transition-all ${
                        variantStockType === "po"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-emerald-500 text-white border-emerald-500"
                      }`}
                    >
                      {variantStockType === "po" ? "PO" : "R"}
                    </button>
                    <input
                      ref={variantFileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleVariantImageUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => variantFileRef.current?.click()}
                      className="shrink-0 px-2.5 py-2 border border-gray-200 rounded-lg text-[10px] text-gray-400 hover:border-pink-300 hover:text-pink-400 transition-all flex items-center justify-center gap-1"
                    >
                      <Camera className="w-3 h-3" />
                      {variantImage ? "✓" : ""}
                    </button>
                  </div>
                  {variantImage && (
                    <div className="relative inline-block">
                      <img src={variantImage} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />
                      <button
                        onClick={() => setVariantImage("")}
                        className="absolute -top-1 -right-1 bg-red-400 text-white rounded-full p-0.5 hover:bg-red-500"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {editingVariantId && (
                    <button
                      onClick={() => { setEditingVariantId(null); setVariantName(""); setVariantImage(""); setVariantStockInput(""); setVariantStockType("ready"); }}
                      className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-xl transition-all text-xs"
                    >
                      Batal
                    </button>
                  )}
                  <button
                    onClick={handleAddVariant}
                    disabled={!variantName.trim()}
                    className="flex-1 py-2.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-pink-200/40 text-xs"
                  >
                    {editingVariantId ? "Simpan" : "Tambah"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {bulkSelect && selectedProducts.size > 0 && !bulkSending && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={bulkSendToGroup}
            className="px-6 py-3 bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-green-300/40 transition-all active:scale-95 flex items-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Kirim {selectedProducts.size} Produk ke Grup
          </button>
        </div>
      )}

      {bulkSending && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-2xl">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Share2 className="w-6 h-6 text-green-500 animate-pulse" />
            </div>
            <p className="text-sm font-bold text-gray-800 mb-1">Mengirim ke Grup...</p>
            <p className="text-xs text-gray-400 mb-3">{bulkProgress.sent}/{bulkProgress.total} produk</p>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.sent / bulkProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
