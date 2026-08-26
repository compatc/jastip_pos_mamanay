import { useEffect, useState, useRef } from "react";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
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
  ClipboardList,
  Loader2,
  Megaphone,
  Send,
  Flame,
  Percent,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
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
  images: string[];
  shopee_pcs: string;
  supplier: string;
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
  images: [],
  shopee_pcs: "1",
  supplier: "",
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
    togglePoClosed,
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
    tags,
    loadTags,
    addTag,
    deleteTag,
    productTags,
    loadProductTags,
    setProductTags,
    customers,
    loadCustomers,
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
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [formVariantImage, setFormVariantImage] = useState("");
  const [formVariantStock, setFormVariantStock] = useState("");
  const [formVariantStockType, setFormVariantStockType] = useState<"ready" | "po">("ready");
  const [bulkSelect, setBulkSelect] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ sent: 0, total: 0 });
  const [rekapProductId, setRekapProductId] = useState<string | null>(null);
  const [rekapItems, setRekapItems] = useState<any[]>([]);
  const [rekapLoading, setRekapLoading] = useState(false);
  const existingSuppliers = [...new Set(customers.filter((c: any) => c.category === "supplier").map((c: any) => c.name))].sort();

  const [poSummaryOpen, setPoSummaryOpen] = useState(false);
  const [poSummaryItems, setPoSummaryItems] = useState<any[]>([]);
  const [poSummaryLoading, setPoSummaryLoading] = useState(false);
  const [promoRecs, setPromoRecs] = useState<any[]>([]);
  const [promoLoading, setPromoLoading] = useState(true);
  const [sendingPromo, setSendingPromo] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const [previewPromo, setPreviewPromo] = useState<any | null>(null);
  const [cancelPoProductId, setCancelPoProductId] = useState<string | null>(null);
  const [cancelPoOrders, setCancelPoOrders] = useState<any[]>([]);
  const [cancelPoLoading, setCancelPoLoading] = useState(false);
  const [cancelPoConfirming, setCancelPoConfirming] = useState(false);
  const [cancelPoSelected, setCancelPoSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProducts();
    loadAllProductDiscounts();
    loadVariantStock();
    loadTags();
    loadCustomers();
    fetch("/api/catalog-order?promoRec=1&days=30&minStock=3")
      .then((r) => r.json())
      .then((d) => setPromoRecs(d.recommendations || []))
      .catch(() => {})
      .finally(() => setPromoLoading(false));
  }, []);

  useEffect(() => {
    for (const p of products) {
      loadProductTags(p.id);
    }
  }, [products]);

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
      ? Math.max(0, Object.values(vs).reduce((a, b) => a + b, 0))
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

  async function openRekap(productId: string) {
    setRekapProductId(productId);
    setRekapLoading(true);
    try {
      const product = products.find(p => p.id === productId);
      const productName = product?.name || "";
      const cleanName = productName.replace(/\s*\[PO\]\s*/gi, "").trim();
      const { data: items, error } = await supabase
        .from("order_items")
        .select("product_name, variant, quantity, price, discount, order_id, product_id")
        .or(`product_id.eq.${productId},product_name.eq.${productName},product_name.ilike.%${cleanName}%`);
      if (error) throw error;
      if (!items || items.length === 0) {
        setRekapItems([]);
        return;
      }
      const orderIds = [...new Set(items.map((i: any) => i.order_id))];
      const { data: orders } = await supabase
        .from("orders")
        .select("id, created_at, customer_id, order_type")
        .in("id", orderIds)
        .eq("order_type", "penjualan");
      const customerIds = [...new Set((orders || []).map((o: any) => o.customer_id).filter(Boolean))];
      const { data: customers } = customerIds.length > 0
        ? await supabase.from("customers").select("id, name, phone").in("id", customerIds)
        : { data: [] };
      const customerMap = new Map((customers || []).map((c: any) => [c.id, { name: c.name, phone: c.phone || "" }]));
      const orderMap = new Map((orders || []).map((o: any) => {
        const c = customerMap.get(o.customer_id) || { name: "-", phone: "" };
        return [o.id, { ...o, customer_name: c.name, customer_phone: c.phone, customer_id: o.customer_id }];
      }));
      // Filter: only penjualan orders
      const penjualanOrderIds = new Set((orders || []).map((o: any) => o.id));
      const merged = items
        .filter((i: any) => penjualanOrderIds.has(i.order_id))
        .map((i: any) => {
          const o = orderMap.get(i.order_id) || {};
          return { ...i, created_at: (o as any).created_at, customer_name: (o as any).customer_name, customer_phone: (o as any).customer_phone || "", customer_id: (o as any).customer_id || "", order_type: (o as any).order_type };
        });
      // Dedup: merge same customer + same product + same variant into single entry
      const customerProductMap = new Map<string, any>();
      for (const i of merged) {
        const key = `${i.customer_id || i.customer_name}|${i.product_name}|${i.variant || ""}`;
        if (customerProductMap.has(key)) {
          const existing = customerProductMap.get(key);
          existing.quantity += i.quantity;
          existing.price = Math.max(existing.price, i.price);
        } else {
          customerProductMap.set(key, { ...i });
        }
      }
      setRekapItems([...customerProductMap.values()]);
    } catch {
      setRekapItems([]);
    } finally {
      setRekapLoading(false);
    }
  }

  async function openPoSummary() {
    setPoSummaryOpen(true);
    setPoSummaryLoading(true);
    try {
      const poProducts = products.filter((p) => (p as any).stock_type === "po");
      if (poProducts.length === 0) { setPoSummaryItems([]); return; }

      const { data: allItems } = await supabase
        .from("order_items")
        .select("product_name, variant, quantity, price, order_id, product_id");
      if (!allItems) { setPoSummaryItems([]); return; }

      const orderIds = [...new Set(allItems.map((i: any) => i.order_id).filter(Boolean))];
      const { data: orders } = orderIds.length > 0
        ? await supabase.from("orders").select("id, payment_status, fulfillment_status, order_type").in("id", orderIds)
        : { data: [] };
      const orderMap = new Map((orders || []).map((o: any) => [o.id, o]));

      const grouped: Record<string, Record<string, { qty: number; total: number; price: number; supplier: string }>> = {};
      for (const item of allItems) {
        const o = orderMap.get(item.order_id);
        if (!o || o.order_type !== "penjualan") continue;
        if (o.payment_status === "paid" && o.fulfillment_status === "completed") continue;
        const cleanName = (item.product_name || "").replace(/\s*\[PO\]\s*/gi, "").trim();
        const matched = poProducts.find((p) => p.name === cleanName || p.name.includes(cleanName) || cleanName.includes(p.name));
        if (!matched) continue;
        const v = item.variant || "(tanpa varian)";
        if (!grouped[matched.name]) grouped[matched.name] = {};
        if (!grouped[matched.name][v]) grouped[matched.name][v] = { qty: 0, total: 0, price: item.price || 0, supplier: (matched as any).supplier || "" };
        grouped[matched.name][v].qty += item.quantity || 1;
        grouped[matched.name][v].total += (item.price || 0) * (item.quantity || 1);
      }

      const productList = Object.entries(grouped).map(([name, variants]) => {
        const variantList = Object.entries(variants).map(([v, data]) => ({ variant: v, qty: data.qty, total: data.total, price: data.price }));
        const totalQty = variantList.reduce((s, v) => s + v.qty, 0);
        const totalHarga = variantList.reduce((s, v) => s + v.total, 0);
        const supplier = Object.values(variants)[0]?.supplier || "";
        return { name, variants: variantList, totalQty, totalHarga, supplier };
      }).sort((a, b) => b.totalQty - a.totalQty);

      const bySupplier: Record<string, typeof productList> = {};
      for (const p of productList) {
        const key = p.supplier || "Tanpa Supplier";
        if (!bySupplier[key]) bySupplier[key] = [];
        bySupplier[key].push(p);
      }

      setPoSummaryItems(Object.entries(bySupplier).map(([supplier, items]) => ({
        supplier,
        items,
        totalQty: items.reduce((s, i) => s + i.totalQty, 0),
        totalHarga: items.reduce((s, i) => s + i.totalHarga, 0),
      })));
    } catch (e) {
      console.error("PO summary error:", e);
      setPoSummaryItems([]);
    } finally {
      setPoSummaryLoading(false);
    }
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
    const existingImages = (product as any).images || (product.image ? [product.image] : []);
    setForm({
      name: product.name,
      description: (product as any).description || "",
      cost_price: product.cost_price.toString(),
      sell_price: product.sell_price.toString(),
      stock: product.stock.toString(),
      stock_type: (product as any).stock_type || "ready",
      unit: product.unit || "PCS",
      image: product.image || "",
      images: existingImages,
      shopee_pcs: ((product as any).shopee_pcs || 1).toString(),
      supplier: (product as any).supplier || "",
    });
    setFormVariants([]);
    loadProductVariants(id);
    loadProductTags(id).then(() => {
      setSelectedTagIds(useStore.getState().productTags[id] || []);
    });
    setShowForm(true);
  }

  async function uploadToStorage(file: File): Promise<string | null> {
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("products").upload(filename, file, {
      contentType: file.type,
      upsert: true,
    });
    if (error) { console.error("Upload error:", error.message); return null; }
    const { data } = supabase.storage.from("products").getPublicUrl(filename);
    return data?.publicUrl || null;
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const maxSize = 1.5 * 1024 * 1024;
    const newImages: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) { alert(`Ukuran gambar ${file.name} melebihi 1.5MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`); continue; }
      const url = await uploadToStorage(file);
      if (url) newImages.push(url);
    }
    if (newImages.length > 0) {
      const allImages = [...form.images, ...newImages];
      setForm({ ...form, image: allImages[0] || "", images: allImages });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    const newImages = form.images.filter((_, i) => i !== index);
    setForm({ ...form, image: newImages[0] || "", images: newImages });
  }

  function setMainImage(index: number) {
    if (index === 0) return;
    const newImages = [...form.images];
    const [moved] = newImages.splice(index, 1);
    newImages.unshift(moved);
    setForm({ ...form, image: newImages[0] || "", images: newImages });
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
          form.description.trim(),
          form.images,
          form.supplier.trim()
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
          form.description.trim(),
          form.images,
          form.supplier.trim()
        );
      }

      // Save new variants from form
      if (productId && formVariants.length > 0) {
        for (const v of formVariants) {
          await addProductVariant(productId, v.name, v.image, parseInt(v.stock) || 0, v.stock_type);
        }
        loadVariantStock();
      }

      // Save tags
      if (productId) {
        await setProductTags(productId, selectedTagIds);
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditId(null);
      setFormVariants([]);
      setFormVariantName("");
      setFormVariantImage("");
      setFormVariantStock("");
      setSelectedTagIds([]);
      setNewTagName("");
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
    const realStock = hasVariants ? Math.max(0, Object.values(vs).reduce((a, b) => a + b, 0)) : p.stock;
    return s + p.cost_price * realStock;
  }, 0);
  const totalJual = filtered.reduce((s, p) => {
    const vs = variantStock[p.id];
    const hasVariants = vs && Object.keys(vs).length > 0;
    const realStock = hasVariants ? Math.max(0, Object.values(vs).reduce((a, b) => a + b, 0)) : p.stock;
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

  async function sendPromoToGroup(promo: any) {
    setSendingPromo(promo.id);
    setSendStatus(null);
    try {
      const img = promo.image || "";
      const caption = promo.promoMsg.split("\n").join("\n");
      const res = await fetch("https://hardship-broadly-mammogram.ngrok-free.dev/api/send-group", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
        body: JSON.stringify({ group_jid: "120363404605912473@g.us", message: caption, image: img }),
      });
      const data = await res.json();
      setSendStatus({ ok: data.ok, msg: data.ok ? `"${promo.name}" terkirim!` : (data.error || "Gagal kirim") });
    } catch (e: any) {
      setSendStatus({ ok: false, msg: "Error: " + (e.message || e) });
    } finally {
      setSendingPromo(null);
      setTimeout(() => setSendStatus(null), 3000);
    }
  }

  async function sendAllPromos() {
    setSendingPromo("all");
    setSendStatus(null);
    const BOT_URL = import.meta.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
    const GROUP_ID = "120363404605912473@g.us";
    let ok = 0, fail = 0;
    for (const p of promoRecs) {
      try {
        const caption = p.promoMsg.split("\n").join("\n");
        const res = await fetch(`${BOT_URL}/api/send-group`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
          body: JSON.stringify({ group_jid: GROUP_ID, message: caption, image: p.image || "" }),
        });
        const data = await res.json();
        if (data.ok) ok++; else fail++;
      } catch {
        fail++;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setSendStatus({ ok: fail === 0, msg: `Selesai: ${ok} berhasil, ${fail} gagal` });
    setSendingPromo(null);
    setTimeout(() => setSendStatus(null), 4000);
  }

  function promoTypeBadge(type: string, value?: number) {
    switch (type) {
      case "flash_sale": return { icon: Flame, color: "bg-red-100 text-red-600 border-red-200", label: "Flash Sale" };
      case "bundling": return { icon: Package, color: "bg-purple-100 text-purple-600 border-purple-200", label: value ? `Bundling ${value}%` : "Bundling" };
      case "discount": return { icon: Percent, color: "bg-amber-100 text-amber-600 border-amber-200", label: `Diskon ${value || 15}%` };
      default: return { icon: Sparkles, color: "bg-sky-100 text-sky-600 border-sky-200", label: type };
    }
  }

  function scrollPromo(dir: "left" | "right") {
    if (!promoScrollRef.current) return;
    const amt = 220;
    promoScrollRef.current.scrollBy({ left: dir === "left" ? -amt : amt, behavior: "smooth" });
  }

  async function openCancelPo(productId: string) {
    setCancelPoProductId(productId);
    setCancelPoLoading(true);
    try {
      const product = products.find(p => p.id === productId);
      const productName = product?.name || "";
      const cleanName = productName.replace(/\s*\[PO\]\s*/gi, "").trim();
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_name, variant, quantity, price")
        .or(`product_id.eq.${productId},product_name.eq.${productName},product_name.ilike.%${cleanName}%`);
      if (!items || items.length === 0) {
        setCancelPoOrders([]);
        return;
      }
      const orderIds = [...new Set(items.map((i: any) => i.order_id))];
      const { data: orders } = await supabase
        .from("orders")
        .select("id, customer_id, payment_status, fulfillment_status, created_at")
        .in("id", orderIds);
      const pendingOrders = (orders || []).filter((o: any) =>
        o.fulfillment_status === "belum_ready" || o.fulfillment_status === "ready"
      );
      if (pendingOrders.length === 0) {
        setCancelPoOrders([]);
        return;
      }
      const pendingIds = new Set(pendingOrders.map((o: any) => o.id));
      const affectedItems = items.filter((i: any) => pendingIds.has(i.order_id));
      const customerIds = [...new Set(pendingOrders.map((o: any) => o.customer_id).filter(Boolean))];
      const { data: custs } = customerIds.length > 0
        ? await supabase.from("customers").select("id, name, phone").in("id", customerIds)
        : { data: [] };
      const custMap = new Map((custs || []).map((c: any) => [c.id, c]));
      const merged = pendingOrders.map((o: any) => {
        const cust = custMap.get(o.customer_id) || { name: "-", phone: "" };
        const oItems = affectedItems.filter((i: any) => i.order_id === o.id);
        const total = oItems.reduce((s: number, i: any) => s + (i.price || 0) * (i.quantity || 1), 0);
        const paid = o.payment_status === "paid" ? total : o.payment_status === "dp" ? Math.round(total * 0.5) : 0;
        return {
          orderId: o.id,
          customerName: cust.name,
          customerPhone: cust.phone || "",
          items: oItems,
          total,
          paid,
          sisa: total - paid,
          paymentStatus: o.payment_status,
        };
      });
      setCancelPoOrders(merged);
      setCancelPoSelected(new Set(merged.map(o => o.orderId)));
    } catch {
      setCancelPoOrders([]);
      setCancelPoSelected(new Set());
    } finally {
      setCancelPoLoading(false);
    }
  }

  async function confirmCancelPo() {
    if (!cancelPoProductId || cancelPoSelected.size === 0) return;
    setCancelPoConfirming(true);
    try {
      const orderIds = [...cancelPoSelected];
      await supabase
        .from("orders")
        .update({ fulfillment_status: "cancelled" })
        .in("id", orderIds);
      setCancelPoProductId(null);
      setCancelPoOrders([]);
      setCancelPoSelected(new Set());
      alert(`Berhasil cancel ${orderIds.length} order!`);
    } catch (e: any) {
      alert("Gagal cancel: " + (e.message || e));
    } finally {
      setCancelPoConfirming(false);
    }
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
          {products.some((p) => (p as any).stock_type === "po") && (
            <button
              onClick={openPoSummary}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all active:scale-[0.97] bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
            >
              Rekap PO
            </button>
          )}
          <button
            onClick={openAdd}
            className="shrink-0 px-3 py-2 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shadow-lg shadow-pink-200/40 active:scale-[0.97]"
          >
            <Plus className="w-3.5 h-3.5" />
            Produk
          </button>
        </div>

        {promoRecs.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                  <Megaphone className="w-2.5 h-2.5 text-white" />
                </div>
                <span className="text-[10px] font-bold text-gray-600">Rekomendasi Promo</span>
                <span className="text-[9px] font-bold bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded-full">{promoRecs.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => scrollPromo("left")} className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-all">
                  <ChevronLeft className="w-3 h-3 text-gray-400" />
                </button>
                <button onClick={() => scrollPromo("right")} className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-all">
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                </button>
                <button
                  onClick={sendAllPromos}
                  disabled={sendingPromo !== null}
                  className="ml-1 px-2 py-1 bg-pink-500 hover:bg-pink-600 text-white text-[9px] font-bold rounded-lg transition-all flex items-center gap-1 disabled:opacity-50"
                >
                  {sendingPromo === "all" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Send className="w-2.5 h-2.5" />}
                  Kirim Semua
                </button>
              </div>
            </div>

            {sendStatus && (
              <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold ${sendStatus.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {sendStatus.ok ? "✅ " : "❌ "}{sendStatus.msg}
              </div>
            )}

            <div
              ref={promoScrollRef}
              className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
            >
              {promoRecs.map((promo) => {
                const badge = promoTypeBadge(promo.promoType, promo.promoValue);
                const BadgeIcon = badge.icon;
                return (
                  <div key={promo.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl p-2 min-w-[200px] max-w-[220px] shrink-0 hover:border-pink-200 transition-all">
                    {promo.image ? (
                      <img src={promo.image} alt={promo.name} className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-gray-800 truncate">{promo.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`inline-flex items-center gap-0.5 text-[8px] font-bold px-1 py-0.5 rounded border ${badge.color}`}>
                          <BadgeIcon className="w-2 h-2" />
                          {badge.label}
                        </span>
                        <span className="text-[9px] text-gray-400">Stok:{promo.stock}</span>
                      </div>
                      <span className="text-[9px] font-semibold text-pink-600">Rp{promo.price.toLocaleString("id-ID")}</span>
                    </div>
                    <button
                      onClick={() => setPreviewPromo(promo)}
                      disabled={sendingPromo !== null}
                      className="p-1.5 bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition-all shrink-0 disabled:opacity-50 active:scale-90 shadow-sm shadow-pink-500/20"
                      title="Preview & Kirim"
                    >
                      {sendingPromo === promo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                ? Math.max(0, Object.values(vs).reduce((a, b) => a + b, 0))
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
                          onClick={() => openRekap(product.id)}
                          className="p-1 rounded hover:bg-purple-50 transition-all"
                          title="Rekap Order"
                        >
                          <ClipboardList className="w-3 h-3 text-gray-400 hover:text-purple-500" />
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
                    {(product as any).stock_type === "po" && (
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); togglePoClosed(product.id, !(product as any).po_closed); }}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md transition-all ${
                            (product as any).po_closed
                              ? "bg-red-100 text-red-600 hover:bg-red-200"
                              : "bg-slate-100 text-slate-500 hover:bg-amber-100 hover:text-amber-600"
                          }`}
                        >
                          {(product as any).po_closed ? "PO TUTUP" : "Tutup PO"}
                        </button>
                        {(product as any).po_closed && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openCancelPo(product.id); }}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500 text-white hover:bg-red-600 transition-all"
                          >
                            Cancel Order
                          </button>
                        )}
                      </div>
                    )}
                    {(productTags[product.id] || []).length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {(productTags[product.id] || []).map((tid) => {
                          const t = tags.find((x) => x.id === tid);
                          return t ? (
                            <span key={tid} className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">
                              {t.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
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
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                    Tag
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTagIds((prev) =>
                            prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                          selectedTagIds.includes(t.id)
                            ? "bg-pink-100 border-pink-400 text-pink-700"
                            : "bg-gray-50 border-gray-200 text-gray-500 hover:border-pink-300"
                        }`}
                      >
                        {t.name}
                        {selectedTagIds.includes(t.id) && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTag(t.id);
                              setSelectedTagIds((prev) => prev.filter((id) => id !== t.id));
                            }}
                            className="ml-1 text-pink-400 hover:text-pink-600"
                          >
                            x
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && newTagName.trim()) {
                          e.preventDefault();
                          const id = await addTag(newTagName.trim());
                          if (id) setSelectedTagIds((prev) => [...prev, id]);
                          setNewTagName("");
                        }
                      }}
                      placeholder="Tambah tag baru..."
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-pink-200"
                    />
                    {newTagName.trim() && (
                      <button
                        type="button"
                        onClick={async () => {
                          const id = await addTag(newTagName.trim());
                          if (id) setSelectedTagIds((prev) => [...prev, id]);
                          setNewTagName("");
                        }}
                        className="px-3 py-2 bg-pink-500 text-white rounded-lg text-xs font-medium hover:bg-pink-600"
                      >
                        +
                      </button>
                    )}
                  </div>
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
                    Supplier
                  </label>
                  <input
                    type="text"
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    placeholder="Pilih atau ketik supplier"
                    list="supplier-list"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                  />
                  <datalist id="supplier-list">
                    {existingSuppliers.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
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
                    Gambar Produk {form.images.length > 0 && `(${form.images.length})`}
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {form.images.length > 0 && (
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {form.images.map((img, idx) => (
                        <div key={idx} className="relative group cursor-pointer" onClick={() => setMainImage(idx)}>
                          <img src={img} alt={`#${idx + 1}`} className={`w-16 h-16 object-cover rounded-xl border-2 transition-all ${idx === 0 ? "border-pink-500 ring-2 ring-pink-200" : "border-gray-200 hover:border-pink-300"}`} />
                          {idx === 0 && <span className="absolute -bottom-1 -left-1 bg-pink-500 text-white text-[8px] px-1 rounded-full font-bold">UTAMA</span>}
                          {idx !== 0 && <span className="absolute -bottom-1 -left-1 bg-gray-400 text-white text-[8px] px-1 rounded-full font-bold opacity-0 group-hover:opacity-100 transition-opacity">Jadikan Utama</span>}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                            className="absolute -top-1.5 -right-1.5 bg-red-400 text-white rounded-full p-0.5 hover:bg-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 hover:border-pink-300 hover:bg-pink-50/30 transition-all cursor-pointer min-h-[60px]"
                  >
                    <Camera className="w-5 h-5 text-pink-300" />
                    <span className="text-xs text-pink-400 font-medium">Tap untuk tambah gambar</span>
                    <span className="text-[10px] text-gray-400">Bisa pilih banyak sekaligus · Maks 1.5MB/file</span>
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
          ? `🏷️ ${product.name}${stockTypeBadge} ${product.sell_price.toLocaleString("id-ID")}\n${shareDesc ? "\n" + shareDesc + "\n" : ""}${variants.map((v) => `• ${v.name}${v.stock > 0 ? ` [stok:${v.stock}]` : ""}`).join("\n")}${footer}`
          : `🏷️ ${displayName}${stockTypeBadge} ${product.sell_price.toLocaleString("id-ID")}\n${shareDesc ? "\n" + shareDesc + "\n" : ""}${displayStock > 0 ? `[stok:${displayStock}]` : ""}${footer}`;
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
                <div className="bg-[#e5ddd5] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9InAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJyZ2JhKDAsMCwwLDAuMDMpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI3ApIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiLz48L3N2Zz4=')] rounded-xl p-3 min-h-[120px] max-h-[300px] overflow-y-auto">
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
                          const stockLabel = v.stock > 0 ? ` [stok:${v.stock}]` : "";
                          const msg = `🏷️ ${product.name} ${v.name}${stType} ${product.sell_price.toLocaleString("id-ID")}\n${shareDesc ? "\n" + shareDesc + "\n" : ""}• ${v.name}${stockLabel}\n\n_Fix, reply difoto_`;
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
                        const lines = variants.map((v) => `• ${v.name}${v.stock > 0 ? ` [stok:${v.stock}]` : ""}`).join("\n");
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

      {rekapProductId && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-start justify-center px-4 pt-10">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col" style={{maxHeight: 'min(80vh, 80dvh)'}}>
            {(() => {
              const product = products.find(p => p.id === rekapProductId);
              const items = rekapItems;
              const byVariant: Record<string, { qty: number; revenue: number; orders: number; customers: Set<string> }> = {};
              const byCustomer: Record<string, { qty: number; revenue: number; orders: Set<string> }> = {};
              let totalQty = 0;
              let totalRevenue = 0;
              let rekapPreviewMsg = "";
              for (const i of items) {
                const vname = i.variant || "(tanpa varian)";
                if (!byVariant[vname]) byVariant[vname] = { qty: 0, revenue: 0, orders: new Set(), customers: new Set() };
                byVariant[vname].qty += i.quantity;
                byVariant[vname].revenue += (i.price * i.quantity) - (i.discount || 0);
                byVariant[vname].orders.add(i.order_id);
                byVariant[vname].customers.add(i.customer_name || "-");
                const cname = i.customer_name || "-";
                if (!byCustomer[cname]) byCustomer[cname] = { qty: 0, revenue: 0, orders: new Set() };
                byCustomer[cname].qty += i.quantity;
                byCustomer[cname].revenue += (i.price * i.quantity) - (i.discount || 0);
                byCustomer[cname].orders.add(i.order_id);
                totalQty += i.quantity;
                totalRevenue += (i.price * i.quantity) - (i.discount || 0);
              }
              return (
                <>
                  <div className="px-5 pt-5 pb-3 border-b border-purple-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">Rekap Order</h3>
                        <p className="text-sm text-purple-500 font-medium">{product?.name || "-"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {items.length > 0 && (
                          <button
                            onClick={async () => {
                              const GROUP_ID = "120363404605912473@g.us";
                              const BOT_URL = import.meta.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
                              const msg = rekapPreviewMsg;
                              try {
                                await fetch(`${BOT_URL}/api/send-group`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
                                  body: JSON.stringify({ group_jid: GROUP_ID, message: msg }),
                                });
                                alert("Rekap berhasil dikirim ke grup!");
                              } catch {
                                alert("Gagal mengirim ke grup");
                              }
                            }}
                            className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600 font-medium"
                          >
                            📤 Kirim ke Grup
                          </button>
                        )}
                        <button onClick={() => { setRekapProductId(null); setRekapItems([]); }} className="p-1.5 rounded-full hover:bg-gray-100">
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 py-3">
                    {rekapLoading ? (
                      <div className="text-center py-8 text-sm text-gray-400">Memuat data...</div>
                    ) : items.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-400">Belum ada order</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-purple-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-purple-600">{totalQty}</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Qty</p>
                          </div>
                          <div className="bg-green-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-green-600">Rp {(totalRevenue).toLocaleString("id-ID")}</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Revenue</p>
                          </div>
                          <div className="bg-blue-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-blue-600">{Object.keys(byVariant).length}</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Varian</p>
                          </div>
                        </div>
                        <div className="mb-4">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Per Varian</p>
                          <div className="space-y-1.5">
                            {Object.entries(byVariant).sort((a, b) => b[1].qty - a[1].qty).map(([name, v]) => (
                              <div key={name} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                                <div>
                                  <p className="text-sm font-semibold text-gray-700">{name}</p>
                                  <p className="text-[10px] text-gray-400">{v.orders.size} order · {v.customers.size} pelanggan</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-gray-800">{v.qty} pcs</p>
                                  <p className="text-[10px] text-green-500">Rp {v.revenue.toLocaleString("id-ID")}</p>
                                </div>
                              </div>
                            ))}
                  </div>
                </div>
                <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Per Pelanggan</p>
                          <div className="space-y-1.5">
                            {Object.entries(byCustomer).sort((a, b) => b[1].qty - a[1].qty).map(([name, c]) => (
                              <div key={name} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                                <div>
                                  <p className="text-sm font-semibold text-gray-700">{name}</p>
                                  <p className="text-[10px] text-gray-400">{c.orders.size} order</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-gray-800">{c.qty} pcs</p>
                                  <p className="text-[10px] text-green-500">Rp {c.revenue.toLocaleString("id-ID")}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {(() => {
                          const unit = ((product as any).unit || "pcs").toLowerCase();
                          let msg = `📋 *REKAP ORDER*\n${product?.name || ""}\n`;
                          msg += `list po *${product?.name || ""}*`;
                          if (totalQty > 0 && totalRevenue > 0) {
                            const hargaPerUnit = Math.round(totalRevenue / totalQty);
                            msg += ` harga Rp ${hargaPerUnit.toLocaleString("id-ID")}/ 1 ${unit}`;
                          }
                          msg += `\n`;
                              for (const [vname, v] of Object.entries(byVariant).sort((a, b) => b[1].qty - a[1].qty)) {
                            msg += `\n*${vname}*\n`;
                            const vnameUp = vname.toUpperCase();
                            const custItems = items.filter((i: any) => {
                              const iv = (i.variant || "(tanpa varian)").toUpperCase();
                              return iv === vnameUp;
                            });
                            const custMap = new Map<string, { name: string; phone: string; qty: number }>();
                            custItems.forEach((ci: any) => {
                              const key = ci.customer_id || (ci.customer_name || "-").trim().toLowerCase().replace(/\s+/g, " ");
                              const existing = custMap.get(key);
                              if (existing) {
                                existing.qty += ci.quantity;
                                if (!existing.phone && ci.customer_phone) existing.phone = ci.customer_phone;
                              } else {
                                custMap.set(key, { name: (ci.customer_name || "-").trim(), phone: ci.customer_phone || "", qty: ci.quantity });
                              }
                            });
                            let idx = 0;
                            for (const [, c] of custMap) {
                              const last4 = String(c.phone || c.name || "").replace(/[^0-9]/g, "").slice(-4);
                              msg += `${++idx}. ${c.name} -- ${last4} -- ${c.qty}\n`;
                            }
                            msg += `subtotal: ${v.qty}\n`;
                          }
                          msg += `\ntotal: ${totalQty} ${unit}`;
                          rekapPreviewMsg = msg;
                          return (
                            <div className="mt-4">
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Preview di Grup</p>
                              <div className="bg-[#e5ddd5] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9InAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJyZ2JhKDAsMCwwLDAuMDMpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI3ApIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiLz48L3N2Zz4=')] rounded-xl p-3 min-h-[80px] max-h-[200px] overflow-y-auto">
                                <div className="bg-white rounded-xl shadow-sm max-w-[85%] ml-auto overflow-hidden">
                                  <div className="px-2.5 py-1.5">
                                    <p className="text-[11px] text-gray-800 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/_([^_]+)_/g, '<em>$1</em>') }} />
                                    <div className="flex items-center justify-end gap-1 mt-0.5">
                                      <span className="text-[9px] text-gray-400">12:00</span>
                                      <svg className="w-3 h-3 text-blue-400" viewBox="0 0 16 11" fill="currentColor"><path d="M11.071.653a.457.457 0 0 0-.304-.102-.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.46.46 0 0 0-.353-.146.457.457 0 0 0-.331.136.448.448 0 0 0-.14.339c0 .136.046.255.14.351l2.365 2.44a.463.463 0 0 0 .353.146c.14 0 .27-.046.38-.14l6.545-8.091a.448.448 0 0 0 .1-.362.448.448 0 0 0-.155-.33l-.018-.012z"/><path d="M14.757.148a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102l-.018.012a.448.448 0 0 0-.155.33c0 .142.034.27.1.362l6.545 8.091a.517.517 0 0 0 .38.14c.14 0 .27-.046.353-.14l2.365-2.44a.455.455 0 0 0 .14-.351.448.448 0 0 0-.14-.339.457.457 0 0 0-.331-.136.46.46 0 0 0-.353.146l-2.011 2.095-6.19-7.636z" opacity=".5"/></svg>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* PO Summary Modal */}
      {poSummaryOpen && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-end md:items-center justify-center" onClick={() => setPoSummaryOpen(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl overflow-hidden flex flex-col animate-[slideUp_0.3s_ease]" style={{maxHeight: 'min(85vh, 85dvh)'}} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">Rekap PO</h2>
                <p className="text-xs text-gray-400 mt-0.5">Total order yang perlu dibeli ke supplier</p>
              </div>
              <button onClick={() => setPoSummaryOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 p-4 md:p-5" style={{WebkitOverflowScrolling: 'touch'}}>
              {poSummaryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                </div>
              ) : poSummaryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Package className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-gray-400 font-bold text-sm">Tidak ada order PO</p>
                  <p className="text-gray-300 text-xs mt-1">Semua produk PO sudah diproses</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {poSummaryItems.map((group: any) => (
                    <div key={group.supplier}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-800 truncate">{group.supplier}</h3>
                          <p className="text-[10px] text-gray-400">{group.items.length} produk — {group.totalQty} pcs</p>
                        </div>
                      </div>
                      <div className="space-y-3 pl-10">
                        {group.items.map((item: any) => (
                          <div key={item.name} className="bg-gray-50 rounded-2xl p-3">
                            <div className="flex items-start justify-between mb-1.5">
                              <h4 className="text-xs font-bold text-gray-700 flex-1 min-w-0 truncate">{item.name}</h4>
                              <span className="text-xs font-extrabold text-rose-500 shrink-0 ml-2">{item.totalQty} pcs</span>
                            </div>
                            <div className="space-y-1">
                              {item.variants.map((v: any) => (
                                <div key={v.variant} className="flex items-center justify-between text-[11px]">
                                  <span className="text-gray-500">{v.variant}</span>
                                  <span className="font-semibold text-gray-700">{v.qty} pcs {v.total > 0 ? `— Rp ${v.total.toLocaleString("id-ID")}` : ""}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200 ml-10 flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-600">Subtotal {group.supplier}</span>
                        <span className="font-extrabold text-gray-800">{group.totalQty} pcs — Rp {group.totalHarga.toLocaleString("id-ID")}</span>
                      </div>
                    </div>
                  ))}

                  <div className="bg-rose-50 rounded-2xl p-4 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-rose-700">Total Semua</span>
                      <span className="text-lg font-extrabold text-rose-600">
                        {poSummaryItems.reduce((s: number, g: any) => s + g.totalQty, 0)} pcs — Rp {poSummaryItems.reduce((s: number, g: any) => s + g.totalHarga, 0).toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewPromo && (() => {
        const promo = previewPromo;
        const img = promo.image || "";
        const previewMsg = promo.promoMsg.split("\n").join("\n");
        return (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-pink-100 rounded-2xl p-5 max-w-sm w-full shadow-2xl shadow-pink-100/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-800">Preview Promo</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{promo.name}</p>
                </div>
                <button onClick={() => setPreviewPromo(null)} className="p-2 hover:bg-pink-50 rounded-xl transition-all">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {img && (
                <div className="mb-3 flex justify-center">
                  <img src={img} alt={promo.name} className="w-20 h-20 rounded-xl object-cover border border-gray-100" />
                </div>
              )}

              <div className="mb-3">
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Preview di Grup</label>
                <div className="bg-[#e5ddd5] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9InAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJyZ2JhKDAsMCwwLDAuMDMpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI3ApIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiLz48L3N2Zz4=')] rounded-xl p-3 min-h-[120px] max-h-[300px] overflow-y-auto">
                  <div className="bg-white rounded-xl shadow-sm max-w-[85%] ml-auto overflow-hidden">
                    {img && (
                      <img src={img} alt={promo.name} className="w-full h-32 object-cover" />
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
                  setSendingPromo(promo.id);
                  setSendStatus(null);
                  try {
                    const caption = previewMsg;
                    const res = await fetch("https://hardship-broadly-mammogram.ngrok-free.dev/api/send-group", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: "Bearer mamanay2026" },
                      body: JSON.stringify({ group_jid: "120363404605912473@g.us", message: caption, image: img }),
                    });
                    const data = await res.json();
                    setSendStatus({ ok: data.ok, msg: data.ok ? `"${promo.name}" terkirim!` : (data.error || "Gagal kirim") });
                  } catch (e: any) {
                    setSendStatus({ ok: false, msg: "Error: " + (e.message || e) });
                  } finally {
                    setSendingPromo(null);
                    setPreviewPromo(null);
                    setTimeout(() => setSendStatus(null), 3000);
                  }
                }}
                disabled={sendingPromo !== null}
                className="w-full py-2.5 bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-200/40 text-sm"
              >
                {sendingPromo === previewPromo?.id ? "Mengirim..." : "Kirim ke Grup"}
              </button>
            </div>
          </div>
        );
      })()}

      {cancelPoProductId && (() => {
        const product = products.find(p => p.id === cancelPoProductId);
        return (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-pink-100 rounded-2xl p-5 max-w-sm w-full shadow-2xl shadow-pink-100/50 max-h-[85dvh] flex flex-col">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div>
                  <h3 className="text-base font-bold text-gray-800">Cancel Order PO</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{product?.name || "-"}</p>
                </div>
                <button onClick={() => { setCancelPoProductId(null); setCancelPoOrders([]); }} className="p-2 hover:bg-pink-50 rounded-xl transition-all">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto mb-3">
                {cancelPoLoading ? (
                  <div className="text-center py-8 text-sm text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Mencari order...
                  </div>
                ) : cancelPoOrders.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    Tidak ada order yang perlu dicancel
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-gray-400 font-semibold">
                        {cancelPoOrders.length} order ditemukan (belum_ready/ready):
                      </p>
                      <button
                        onClick={() => {
                          if (cancelPoSelected.size === cancelPoOrders.length) {
                            setCancelPoSelected(new Set());
                          } else {
                            setCancelPoSelected(new Set(cancelPoOrders.map(o => o.orderId)));
                          }
                        }}
                        className="text-[10px] text-pink-500 font-bold hover:text-pink-600"
                      >
                        {cancelPoSelected.size === cancelPoOrders.length ? "Batal Pilih" : "Pilih Semua"}
                      </button>
                    </div>
                    {cancelPoOrders.map((o) => {
                      const isSelected = cancelPoSelected.has(o.orderId);
                      return (
                        <div
                          key={o.orderId}
                          onClick={() => {
                            setCancelPoSelected(prev => {
                              const next = new Set(prev);
                              if (next.has(o.orderId)) next.delete(o.orderId);
                              else next.add(o.orderId);
                              return next;
                            });
                          }}
                          className={`border rounded-xl p-3 cursor-pointer transition-all ${
                            isSelected ? "bg-red-50 border-red-300 shadow-sm" : "bg-gray-50 border-gray-200 opacity-60"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                              isSelected ? "bg-red-500 border-red-500" : "border-gray-300 bg-white"
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div>
                                  <p className="text-xs font-bold text-gray-800">{o.customerName}</p>
                                  <p className="text-[10px] text-gray-400">{o.customerPhone || "Tanpa HP"}</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  o.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-600" :
                                  o.paymentStatus === "dp" ? "bg-amber-100 text-amber-600" :
                                  "bg-gray-100 text-gray-500"
                                }`}>
                                  {o.paymentStatus === "paid" ? "Sudah Bayar" : o.paymentStatus === "dp" ? "DP" : "Belum Bayar"}
                                </span>
                              </div>
                              <div className="space-y-0.5">
                                {o.items.map((item: any, idx: number) => (
                                  <p key={idx} className="text-[10px] text-gray-600">
                                    {item.product_name}{item.variant ? ` ${item.variant}` : ""} × {item.quantity}
                                  </p>
                                ))}
                              </div>
                              {o.sisa > 0 && (
                                <p className="text-[10px] text-red-500 font-semibold mt-1">
                                  Sisa bayar: Rp{o.sisa.toLocaleString("id-ID")}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {cancelPoOrders.length > 0 && (
                <div className="shrink-0 space-y-2">
                  <p className="text-[10px] text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-lg p-2">
                    ⚠️ Order yang sudah dibayar (DP/Lunas) tetap dicancel. Hubungi pelanggan untuk refund.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setCancelPoProductId(null); setCancelPoOrders([]); setCancelPoSelected(new Set()); }}
                      className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-xl transition-all text-sm"
                    >
                      Batal
                    </button>
                    <button
                      onClick={confirmCancelPo}
                      disabled={cancelPoConfirming || cancelPoSelected.size === 0}
                      className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-red-200/40"
                    >
                      {cancelPoConfirming ? "Mencancel..." : `Cancel ${cancelPoSelected.size} Order`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
