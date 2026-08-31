import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Search, Package, MessageCircle, ShoppingCart, X, Plus, Minus, Check, Loader2, Share2 } from "lucide-react";

interface Variant {
  id: string;
  name: string;
  image: string;
  stock: number;
  stock_type?: string | null;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  sell_price: number;
  stock: number;
  stock_type?: string;
  unit: string;
  image: string;
  images?: string[];
  variants?: Variant[];
  tags?: { id: string; name: string }[];
}

interface CartItem {
  product: Product;
  variant?: Variant;
  qty: number;
}

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function getStockInfo(stock: number) {
  if (stock <= 0) return { label: "Habis", color: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400" };
  if (stock <= 3) return { label: "Sisa " + stock, color: "bg-red-50 text-red-600 border-red-200", dot: "bg-red-500" };
  if (stock <= 8) return { label: "Sisa " + stock, color: "bg-amber-50 text-amber-600 border-amber-200", dot: "bg-amber-500" };
  return { label: "Ready", color: "bg-emerald-50 text-emerald-600 border-emerald-200", dot: "bg-emerald-500" };
}

const EMOJIS = ["🧕", "👗", "🧣", "👒", "👜", "✨", "🪡", "💃"];

function getEmoji(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return EMOJIS[Math.abs(hash) % EMOJIS.length];
}

const GRADIENTS = [
  "from-pink-50 to-rose-100",
  "from-blue-50 to-indigo-100",
  "from-emerald-50 to-teal-100",
  "from-amber-50 to-orange-100",
  "from-purple-50 to-violet-100",
  "from-fuchsia-50 to-pink-100",
  "from-cyan-50 to-sky-100",
  "from-lime-50 to-green-100",
];

function getGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function Catalog() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = searchParams.get("tag") || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  // Checkout form
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custNotes, setCustNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  const [descExpanded, setDescExpanded] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  const [descOverflow, setDescOverflow] = useState(false);

  useEffect(() => {
    if (descRef.current) {
      setDescOverflow(descRef.current.scrollHeight > 80);
    }
  }, [selected]);

  const toggleDesc = useCallback(() => setDescExpanded((v) => !v), []);

  useEffect(() => {
        fetch("/api/catalog-order")
      .then((r) => r.json())
      .then((d) => {
        const prods = d.data || [];
        setProducts(prods);
        setLoading(false);
        if (id) {
          const found = prods.find((p: Product) => p.id === id);
          if (found) setSelected(found);
        }
      })
      .catch(() => setLoading(false));
  }, [id]);

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    products.forEach((p) => {
      const words = p.name.split(" ");
      if (words.length > 0) {
        const cat = words[0];
        cats.set(cat, (cats.get(cat) || 0) + 1);
      }
    });
    return Array.from(cats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
  }, [products]);

  const allUniqueTags = useMemo(() => {
    const tagSet = new Set<string>();
    products.forEach((p) => (p.tags || []).forEach((t) => tagSet.add(t)));
    return Array.from(tagSet);
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (p.stock <= 0 && p.stock_type !== "po") return false;
      if (p.stock_type === "po" && (p as any).po_closed) return false;
      if (tagFilter && !(p.tags || []).some((t) => (typeof t === "string" ? t : t.name) === tagFilter)) return false;
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      if (filter === "ready") return matchSearch && p.stock_type !== "po";
      if (filter === "po") return matchSearch && p.stock_type === "po";
      return matchSearch;
    });
  }, [products, search, filter, tagFilter]);

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const cartTotal = cart.reduce((s, c) => s + c.product.sell_price * c.qty, 0);

  function addToCart(product: Product, variant?: Variant) {
    const vId = variant?.id || "";
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id && (c.variant?.id || "") === vId);
      const maxStock = variant ? variant.stock : product.stock;
      if (existing) {
        const newQty = Math.min(existing.qty + 1, maxStock);
        return prev.map((c) => c.product.id === product.id && (c.variant?.id || "") === vId ? { ...c, qty: newQty } : c);
      }
      return [...prev, { product, variant, qty: 1 }];
    });
    setSelected(null);
    setSelectedVariant(null);
    window.history.pushState({}, "", "/catalog");
  }

  function updateCartQty(productId: string, variantId: string, delta: number) {
    setCart((prev) => {
      return prev
        .map((c) => {
          if (c.product.id !== productId || (c.variant?.id || "") !== variantId) return c;
          const maxStock = c.variant ? c.variant.stock : c.product.stock;
          const newQty = c.qty + delta;
          return { ...c, qty: Math.min(newQty, maxStock) };
        })
        .filter((c) => c.qty > 0);
    });
  }

  function removeFromCart(productId: string, variantId: string) {
    setCart((prev) => prev.filter((c) => c.product.id !== productId || (c.variant?.id || "") !== variantId));
  }

  function getCartQty(productId: number, variantId?: string) {
    return cart.find((c) => c.product.id === productId && (c.variant?.id || "") === (variantId || ""))?.qty || 0;
  }

  async function submitOrder() {
    if (!custName.trim() || !custPhone.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/catalog-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            product_id: c.product.id,
            product_name: c.variant ? `${c.product.name} ${c.variant.name}` : c.product.name,
            quantity: c.qty,
            price: c.product.sell_price,
            variant: c.variant?.name || null,
          })),
          customer_name: custName.trim(),
          phone: custPhone.trim(),
          address: custAddress.trim(),
          notes: custNotes.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setOrderSuccess(data.order_id);
        setCart([]);
        setCustName("");
        setCustPhone("");
        setCustAddress("");
        setCustNotes("");
        // Reload products to update stock
    fetch("/api/catalog-order")
          .then((r) => r.json())
          .then((d) => setProducts(d.data || []));
      } else {
        alert(data.error || "Gagal mengirim pesanan");
      }
    } catch {
      alert("Gagal mengirim pesanan");
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-dvh bg-[#f8f7f4]">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#f8f7f4]/90 backdrop-blur-xl">
        <div className="px-4 sm:px-6 lg:px-8 pt-5 pb-4 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[1.35rem] font-extrabold text-slate-900 tracking-tight">jastip_mamanay</h1>
              <p className="text-[0.78rem] text-slate-400 font-medium mt-0.5">{products.length} produk tersedia</p>
            </div>
            <button
              onClick={() => setShowCart(true)}
              className="relative w-12 h-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ShoppingCart className="w-5 h-5 text-slate-700" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                  {cartCount}
                </span>
              )}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mau cari apa?"
              className="w-full pl-12 pr-5 py-3.5 bg-white border-0 rounded-2xl text-[0.9rem] font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto pb-28">
        {/* Tag Filter */}
        {allUniqueTags.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-4 -mx-1 px-1 scrollbar-hide items-center">
            <button
              onClick={() => { const p = new URLSearchParams(searchParams); p.delete("tag"); setSearchParams(p); }}
              className={`px-4 py-2.5 rounded-2xl text-[0.82rem] font-bold whitespace-nowrap transition-all shrink-0 border-2 ${
                !tagFilter
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              Semua
            </button>
            {allUniqueTags.map((t) => (
              <button
                key={t}
                onClick={() => { const p = new URLSearchParams(searchParams); p.set("tag", t); setSearchParams(p); }}
                className={`px-4 py-2.5 rounded-2xl text-[0.82rem] font-semibold whitespace-nowrap transition-all shrink-0 border-2 ${
                  tagFilter === t
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
            {tagFilter && (
              <button
                onClick={() => { const url = window.location.origin + "/api/catalog-order?ogTag=" + tagFilter; navigator.clipboard.writeText(url).then(() => alert("Link copied!")).catch(() => {}); }}
                className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
                title="Copy share link"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
                <div className="h-40 bg-slate-100" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-5 bg-slate-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-bold text-sm">Produk tidak ditemukan</p>
            <p className="text-slate-400 text-xs mt-1">Coba kata kunci lain</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4">
            {filtered.map((p) => {
              const stock = getStockInfo(p.stock);
              const isPoClosed = p.stock_type === "po" && p.po_closed;
              return (
                <div
                  key={p.id}
                  onClick={() => { setSelected(p); setCarouselIdx(0); window.history.pushState({}, "", "/catalog/" + p.id); }}
                  className="bg-white rounded-2xl overflow-hidden border border-slate-100/80 shadow-sm transition-all hover:shadow-md active:scale-[0.98] cursor-pointer group"
                >
                  {/* Image */}
                  {p.image ? (
                    <div className="relative w-full aspect-square bg-slate-50 overflow-hidden">
                      <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      {(p.images && p.images.length > 1) && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                          {p.images.slice(0, 5).map((_: string, i: number) => (
                            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-white/50"}`} />
                          ))}
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        {isPoClosed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border backdrop-blur-sm bg-red-50 text-red-600 border-red-200">
                            PO Ditutup
                          </span>
                        ) : p.stock_type === "po" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border backdrop-blur-sm bg-amber-50 text-amber-600 border-amber-200">
                            PO (Pre-Order)
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border backdrop-blur-sm ${stock.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${stock.dot}`} />
                            {stock.label}
                          </span>
                        )}
                        {p.tags && p.tags.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {p.tags.map((t) => {
                              const tagName = typeof t === "string" ? t : t.name;
                              return (
                              <span key={tagName} className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-purple-50 text-purple-600 border border-purple-200">
                                {tagName}
                              </span>
                            )})}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className={`relative w-full aspect-square bg-gradient-to-br ${getGradient(p.name)} flex items-center justify-center overflow-hidden`}>
                      <span className="text-5xl opacity-80">{getEmoji(p.name)}</span>
                      <div className="absolute top-2 right-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border backdrop-blur-sm ${stock.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${stock.dot}`} />
                          {stock.label}
                        </span>
                        {p.stock_type === "po" && (
                          <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold border backdrop-blur-sm mt-1 ${
                            p.po_closed ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200"
                          }`}>
                            {p.po_closed ? "PO Ditutup" : "PO (Pre-Order)"}
                          </span>
                        )}
                        {p.tags && p.tags.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {p.tags.map((t) => {
                              const tagName = typeof t === "string" ? t : t.name;
                              return (
                              <span key={tagName} className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-purple-50 text-purple-600 border border-purple-200">
                                {tagName}
                              </span>
                            )})}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-2.5 sm:p-3">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-800 leading-snug line-clamp-2 mb-1 min-h-[32px] sm:min-h-[36px]">
                      {p.name}
                    </h3>
                    {p.variants && p.variants.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {p.variants.slice(0, 3).map((v) => (
                          <span key={v.id} className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-semibold">
                            {v.name}
                          </span>
                        ))}
                        {p.variants.length > 3 && (
                          <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-semibold">
                            +{p.variants.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-end justify-between">
                      <span className="text-sm sm:text-base font-extrabold text-rose-500 leading-none">
                        {rupiah(p.sell_price)}
                      </span>
                      <div className="flex items-center gap-1">
                        {p.stock_type === "po" && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            p.po_closed ? "text-red-600 bg-red-50 border-red-200" : "text-amber-600 bg-amber-50 border-amber-200"
                          }`}>{p.po_closed ? "PO Ditutup" : "PO"}</span>
                        )}
                        {p.stock > 0 && p.stock_type !== "po" && (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Ready</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Floating Cart Button */}
      {cartCount > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[440px]">
          <button
            onClick={() => setShowCart(true)}
            className="w-full flex items-center justify-between bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl shadow-slate-900/30 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold">{cartCount} produk</p>
                <p className="text-[11px] text-slate-400">Lihat keranjang</p>
              </div>
            </div>
            <span className="text-base font-extrabold">{rupiah(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Floating WA Button (visible when cart empty) */}
      {cartCount === 0 && (
        <a
          href="https://wa.me/6285894652806?text=Halo%20Mama%20Nay%2C%20saya%20mau%20pesan%20produk"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-3.5 rounded-2xl shadow-xl shadow-emerald-400/30 transition-all active:scale-95"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">Chat Admin</span>
        </a>
      )}

      {/* Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setSelected(null); window.history.pushState({}, "", "/catalog"); }}
        >
          <div
            className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl overflow-hidden animate-[slideUp_0.3s_ease] md:animate-[popIn_0.25s_ease] max-h-[90vh] md:max-h-[85vh] md:my-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
              <button
                onClick={() => { setSelected(null); window.history.pushState({}, "", "/catalog"); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors -mt-1"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0">
            {selected.image ? (
              <div className="w-full max-h-80 lg:max-h-96 bg-slate-50 overflow-hidden flex items-center justify-center relative">
                {(() => {
                  const allImages = (selected.images && selected.images.length > 0) ? selected.images : [selected.image];
                  const imgSrc = allImages[carouselIdx] || allImages[0];
                  return (
                    <>
                      <img src={imgSrc} alt={selected.name} className="w-full object-contain max-h-80 lg:max-h-96" />
                      {allImages.length > 1 && (
                        <>
                          <button onClick={() => setCarouselIdx((carouselIdx - 1 + allImages.length) % allImages.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">‹</button>
                          <button onClick={() => setCarouselIdx((carouselIdx + 1) % allImages.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">›</button>
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                            {allImages.map((_: string, i: number) => (
                              <button key={i} onClick={() => setCarouselIdx(i)} className={`w-2 h-2 rounded-full transition-all ${i === carouselIdx ? "bg-white scale-110" : "bg-white/50"}`} />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className={`w-full h-56 bg-gradient-to-br ${getGradient(selected.name)} flex items-center justify-center`}>
                <span className="text-7xl opacity-80">{getEmoji(selected.name)}</span>
              </div>
            )}

            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-extrabold text-slate-900 leading-snug">{selected.name}</h2>
                </div>
                <button
                  onClick={() => {
                    const url = window.location.origin + "/api/catalog-order?og=" + selected.id;
                    navigator.clipboard.writeText(url).then(() => alert("Link copied!")).catch(() => {});
                  }}
                  className="shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Share link"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>

              {selected.description && (
                <div className="mb-4">
                  <div
                    ref={descRef}
                    className="text-sm text-slate-600 leading-relaxed whitespace-pre-line transition-all duration-300"
                    style={{
                      textAlign: "justify",
                      maxHeight: descExpanded ? "none" : "80px",
                      overflow: descExpanded ? "visible" : "hidden",
                    }}
                  >
                    {selected.description}
                  </div>
                  {descOverflow && (
                    <button
                      onClick={toggleDesc}
                      className="text-xs font-semibold text-blue-500 mt-1 hover:text-blue-600 transition-colors"
                    >
                      {descExpanded ? "Tutup" : "Baca selengkapnya"}
                    </button>
                  )}
                </div>
              )}

              {selected.tags && selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {selected.tags.map((t) => {
                    const tagName = typeof t === "string" ? t : t.name;
                    return (
                      <span key={tagName} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-50 text-purple-600 border border-purple-100">
                        {tagName}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Price */}
              <div className="bg-rose-50 rounded-2xl p-4 mb-4">
                <p className="text-[11px] text-rose-400 font-semibold mb-0.5">Harga</p>
                <p className="text-2xl font-extrabold text-rose-500">{rupiah(selected.sell_price)}</p>
                <p className="text-xs text-rose-400">per 1 {selected.unit}</p>
              </div>

              {/* Variant selector */}
              {selected.variants && selected.variants.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-bold text-slate-900 mb-2.5">Pilih Varian</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.variants.map((v) => {
                      const isSelected = selectedVariant?.id === v.id;
                      const vStock = getStockInfo(v.stock);
                      return (
                        <button
                          key={v.id}
                          onClick={() => setSelectedVariant(isSelected ? null : v)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                            isSelected
                              ? "border-rose-500 bg-rose-50 text-rose-600"
                              : v.stock <= 0 && selected.stock_type !== "po"
                                ? "border-slate-200 bg-slate-50 text-slate-400 opacity-50"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                          disabled={v.stock <= 0 && selected.stock_type !== "po"}
                        >
                          {v.image && <img src={v.image} alt="" className="w-5 h-5 rounded-full object-cover ring-2 ring-white" />}
                          <span>{v.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${isSelected ? "bg-rose-100 text-rose-600" : selected.stock_type === "po" ? "bg-amber-50 text-amber-600" : vStock.color}`}>{selected.stock_type === "po" ? "PO" : v.stock}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stock info */}
              {selected.po_closed ? (
                <div className="flex items-center gap-3 p-3 rounded-xl mb-4 bg-red-50">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-100">
                    <X className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-700">PO Ditutup</p>
                    <p className="text-[11px] text-red-500">Pesanan untuk produk ini sudah ditutup</p>
                  </div>
                </div>
              ) : (
                <div className={`flex items-center gap-3 p-3 rounded-xl mb-4 ${
                  (selectedVariant ? selectedVariant.stock : selected.stock) > 0 ? "bg-emerald-50" : "bg-slate-50"
                }`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    (selectedVariant ? selectedVariant.stock : selected.stock) > 0 ? "bg-emerald-100" : "bg-slate-100"
                  }`}>
                    <Check className={`w-4 h-4 ${
                      (selectedVariant ? selectedVariant.stock : selected.stock) > 0 ? "text-emerald-600" : "text-slate-400"
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {selected.stock_type === "po"
                        ? "Bisa Pre-Order"
                        : (selectedVariant ? selectedVariant.stock : selected.stock) > 0 ? "Stok tersedia" : "Stok habis"
                      }
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {selected.stock_type === "po" ? "Pre-order, estimasi 7-14 hari" : "Siap dikirim 1-2 hari"}
                    </p>
                  </div>
                </div>
              )}

              <button
                disabled={!!selected.po_closed}
                onClick={() => {
                  if (selected.variants && selected.variants.length > 0 && !selectedVariant) {
                    alert("Pilih varian terlebih dahulu");
                    return;
                  }
                  addToCart(selected, selectedVariant || undefined);
                }}
                className={`flex items-center justify-center gap-2.5 w-full py-3.5 font-bold rounded-2xl transition-all active:scale-[0.98] ${
                  selected.po_closed
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20"
                }`}
              >
                <ShoppingCart className="w-5 h-5" />
                Tambah ke Keranjang
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      {showCart && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowCart(false)}
        >
          <div
            className="bg-white w-full max-w-2xl lg:max-w-3xl rounded-t-3xl overflow-hidden animate-[slideUp_0.3s_ease] max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900">Keranjang ({cartCount})</h2>
              <button onClick={() => setShowCart(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 px-5">
                <ShoppingCart className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-slate-400 font-bold text-sm">Keranjang kosong</p>
                <p className="text-slate-300 text-xs mt-1">Pilih produk yang ingin dibeli</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
                  {cart.map((c) => (
                    <div key={`${c.product.id}-${c.variant?.id || ""}`} className="flex items-center gap-3 bg-slate-50 rounded-2xl p-3">
                      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getGradient(c.product.name)} flex items-center justify-center shrink-0`}>
                        {c.variant?.image || c.product.image ? (
                          <img src={c.variant?.image || c.product.image} alt="" className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          <span className="text-2xl">{getEmoji(c.product.name)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.product.name}</p>
                        {c.variant && <p className="text-[10px] text-slate-500 font-medium">{c.variant.name}</p>}
                        <p className="text-xs text-rose-500 font-bold">{rupiah(c.product.sell_price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQty(c.product.id, c.variant?.id || "", -1)}
                          className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-slate-800">{c.qty}</span>
                        <button
                          onClick={() => updateCartQty(c.product.id, c.variant?.id || "", 1)}
                          className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(c.product.id, c.variant?.id || "")}
                        className="p-1.5 hover:bg-red-50 rounded-lg"
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Cart Footer */}
                <div className="border-t border-slate-100 px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500 font-medium">Total</span>
                    <span className="text-xl font-extrabold text-rose-500">{rupiah(cartTotal)}</span>
                  </div>
                  <button
                    onClick={() => {
                      setShowCart(false);
                      setShowCheckout(true);
                    }}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl transition-all active:scale-[0.98]"
                  >
                    Isi Data & Pesan
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowCheckout(false)}
        >
          <div
            className="bg-white w-full max-w-2xl lg:max-w-3xl rounded-t-3xl overflow-hidden animate-[slideUp_0.3s_ease] max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900">Data Pemesanan</h2>
              <button onClick={() => setShowCheckout(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Order summary */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Ringkasan Pesanan</p>
                {cart.map((c) => (
                  <div key={`${c.product.id}-${c.variant?.id || ""}`} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-slate-700">{c.product.name}{c.variant ? ` ${c.variant.name}` : ""} x{c.qty}</span>
                    <span className="text-sm font-bold text-slate-800">{rupiah(c.product.sell_price * c.qty)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-200 mt-2 pt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">Total</span>
                  <span className="text-lg font-extrabold text-rose-500">{rupiah(cartTotal)}</span>
                </div>
              </div>

              {/* Form */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">Nama Lengkap *</label>
                <input
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="Contoh: Siti Aminah"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">No. WhatsApp *</label>
                <input
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">Alamat</label>
                <input
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  placeholder="Alamat pengiriman (opsional)"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">Catatan</label>
                <textarea
                  value={custNotes}
                  onChange={(e) => setCustNotes(e.target.value)}
                  placeholder="Catatan tambahan (opsional)"
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all resize-none"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <button
                onClick={submitOrder}
                disabled={!custName.trim() || !custPhone.trim() || submitting}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Mengirim...</>
                ) : (
                  <><Check className="w-5 h-5" /> Kirim Pesanan</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Success Modal */}
      {orderSuccess && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-5"
          onClick={() => setOrderSuccess(null)}
        >
          <div
            className="bg-white w-full max-w-sm lg:max-w-md rounded-3xl overflow-hidden p-8 text-center animate-[slideUp_0.3s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 mb-2">Pesanan Terkirim!</h3>
            <p className="text-sm text-slate-500 mb-1">Nomor pesanan:</p>
            <p className="text-lg font-bold text-slate-800 mb-4">#{orderSuccess.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs text-slate-400 mb-6">
              Admin akan menghubungi Anda via WhatsApp untuk konfirmasi dan pembayaran.
            </p>
            <button
              onClick={() => setOrderSuccess(null)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all active:scale-[0.98]"
            >
              Kembali ke Katalog
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
