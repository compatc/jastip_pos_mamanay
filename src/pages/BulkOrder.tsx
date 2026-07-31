import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import { uuid } from "../lib/uuid";
import { ArrowLeft, Plus, Trash2, Search, Package, Check } from "lucide-react";
import { phoneEquals } from "../lib/phone";

interface CustomerEntry {
  id: string;
  name: string;
  phone: string;
  quantity: number;
}

export default function BulkOrder() {
  const navigate = useNavigate();
  const { products, loadProducts, customers, loadCustomers, productDiscounts, loadAllProductDiscounts } = useStore();
  const [loading, setLoading] = useState(false);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [price, setPrice] = useState("");
  const [entries, setEntries] = useState<CustomerEntry[]>([
    { id: crypto.randomUUID(), name: "", phone: "", quantity: 1 },
  ]);
  const [customerSearch, setCustomerSearch] = useState<Record<string, string>>({});
  const [showCustomerDropdown, setShowCustomerDropdown] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState(false);
  const [successCount, setSuccessCount] = useState(0);

  const productRef = useRef<HTMLDivElement>(null);

  const selectedProduct = products.find((p) => p.id === productId);

  useEffect(() => {
    loadProducts();
    loadCustomers();
    loadAllProductDiscounts();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productRef.current && !productRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function addEntry() {
    setEntries([...entries, { id: crypto.randomUUID(), name: "", phone: "", quantity: 1 }]);
  }

  function removeEntry(id: string) {
    if (entries.length <= 1) return;
    setEntries(entries.filter((e) => e.id !== id));
  }

  function updateEntry(id: string, field: "name" | "phone" | "quantity", value: string | number) {
    setEntries(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  }

  function selectProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p && !price) setPrice(p.sell_price.toString());
    setProductSearch(p?.name || "");
    setShowProductDropdown(false);
  }

  function selectCustomer(entryId: string, c: { name: string; phone: string }) {
    updateEntry(entryId, "name", c.name);
    if (c.phone) updateEntry(entryId, "phone", c.phone);
    setCustomerSearch({ ...customerSearch, [entryId]: c.name });
    setShowCustomerDropdown({ ...showCustomerDropdown, [entryId]: false });
  }

  const filteredProducts = products.filter((p) =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  function getBulkPrice(qty: number): number | null {
    const discounts = productDiscounts
      .filter((d) => d.product_id === productId && d.min_qty <= qty)
      .sort((a, b) => b.min_qty - a.min_qty);
    return discounts.length > 0 ? discounts[0].discount_price : null;
  }

  async function handleSubmit() {
    if (!productId || !price || entries.some((e) => !e.name.trim() || !e.phone.trim())) return;
    setLoading(true);

    const product = products.find((p) => p.id === productId);
    const priceNum = parseInt(price.replace(/\D/g, "")) || 0;
    let created = 0;

    for (const entry of entries) {
      const qty = Math.max(1, entry.quantity || 1);
      const finalPrice = getBulkPrice(qty) ?? priceNum;
      const name = entry.name.trim();
      if (!name) continue;

      let customerId: string | null = null;
      let partyName = name;
      const existing =
        customers.find((c) => c.name.toLowerCase() === name.toLowerCase()) ||
        (entry.phone
          ? customers.find((c) => c.phone && phoneEquals(c.phone, entry.phone))
          : undefined);
      if (existing) {
        customerId = existing.id;
        partyName = existing.name;
      } else {
        customerId = uuid();
        const { error: custErr } = await supabase.from("customers").insert({
          id: customerId,
          name,
          phone: entry.phone?.trim() || "",
          address: "",
          category: "pelanggan",
          created_at: new Date().toISOString(),
        });
        if (custErr) continue;
      }

      const orderId = uuid();
      const now = new Date().toISOString();
      const total = finalPrice * qty;

      const { error: orderErr } = await supabase.from("orders").insert({
        id: orderId,
        customer_id: customerId,
        user_id: useStore.getState().user?.id || "",
        status: "new",
        total,
        paid_total: 0,
        diskon: 0,
        order_type: "penjualan",
        payment_type: "tf",
        ongkir: 0,
        notes: "",
        account_id: null,
        created_at: now,
        updated_at: now,
      });
      if (orderErr) continue;

      const itemId = uuid();
      await supabase.from("order_items").insert({
        id: itemId,
        order_id: orderId,
        product_id: productId,
        product_name: product?.name || "",
        price: finalPrice,
        quantity: qty,
        discount: 0,
        paid_value: 0,
        status: "new",
      });

      if (product) {
        const { data: fresh } = await supabase
          .from("products")
          .select("id, stock, unit")
          .eq("id", product.id)
          .single();
        if (!fresh) continue;
        const newStock = fresh.stock - qty;
        await supabase.from("products").update({ stock: newStock }).eq("id", fresh.id);
        const { data: maxInv } = await supabase
          .from("stock_movements")
          .select("invoice_no")
          .order("invoice_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextInvoice = ((maxInv?.invoice_no as number) || 0) + 1;
        await supabase.from("stock_movements").insert({
          id: uuid(),
          product_id: fresh.id,
          order_id: orderId,
          date: now.split("T")[0],
          transaction_type: "Penjualan",
          invoice_no: nextInvoice,
          party_name: partyName,
          qty: -qty,
          qty_after: newStock,
          unit: fresh.unit || "SET",
          created_at: now,
        });
      }

      created++;
    }

    await loadProducts();
    await loadCustomers();
    setSuccessCount(created);
    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50 p-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-500" />
        </div>
        <p className="text-lg font-bold text-gray-800">Berhasil!</p>
        <p className="text-sm text-gray-400 mt-1">{successCount} order berhasil dibuat</p>
        <button onClick={() => navigate("/orders")} className="mt-6 px-6 py-3 bg-gradient-to-r from-pink-400 to-rose-500 text-white rounded-2xl font-semibold">
          Ke Daftar Order
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-pink-50 via-white to-rose-50">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-200/30 rounded-full blur-3xl" />
      </div>

      <header className="shrink-0 bg-white/70 backdrop-blur-xl border-b border-pink-100/60 relative z-10">
        <div className="px-5 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2.5 hover:bg-pink-50 rounded-xl transition-all border border-pink-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-800">Buat Order Massal</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="px-5 py-4 space-y-4 pb-8">
          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50" ref={productRef}>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-semibold">Produk</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                onFocus={() => setShowProductDropdown(true)}
                placeholder="Cari produk..."
                className="w-full pl-10 pr-4 py-3 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-700 text-base focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
              {showProductDropdown && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-pink-100 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProduct(p.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-pink-50 text-sm transition-all flex items-center justify-between ${
                        p.id === productId ? "bg-pink-50 text-pink-600" : "text-gray-700"
                      }`}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-gray-400">Stok: {p.stock}</span>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400">Tidak ditemukan</p>
                  )}
                </div>
              )}
            </div>
            {selectedProduct && (
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                <Package className="w-4 h-4" />
                Stok: {selectedProduct.stock} {selectedProduct.unit}
              </div>
            )}
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-widest font-semibold">Harga Satuan</label>
            <input
              type="text"
              value={price ? `Rp ${parseInt(price).toLocaleString("id-ID")}` : ""}
              onChange={(e) => {
                const num = e.target.value.replace(/\D/g, "");
                setPrice(num);
              }}
              placeholder="Rp 0"
              className="w-full px-4 py-3 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-700 text-base focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Pelanggan</label>
              <div className="text-xs text-gray-400">{entries.length} pelanggan</div>
            </div>
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <div key={entry.id} className="bg-white/80 border border-pink-100/60 rounded-2xl p-3 shadow-sm shadow-pink-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 font-mono w-5 shrink-0">#{idx + 1}</span>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={customerSearch[entry.id] ?? entry.name}
                        onChange={(e) => {
                          updateEntry(entry.id, "name", e.target.value);
                          setCustomerSearch({ ...customerSearch, [entry.id]: e.target.value });
                          setShowCustomerDropdown({ ...showCustomerDropdown, [entry.id]: true });
                        }}
                        onFocus={() => setShowCustomerDropdown({ ...showCustomerDropdown, [entry.id]: true })}
                        placeholder="Nama pelanggan"
                        className="w-full px-3 py-2.5 bg-pink-50/50 border border-pink-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                      {showCustomerDropdown[entry.id] && (customerSearch[entry.id] ?? "").length > 0 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-pink-100 rounded-xl shadow-lg max-h-36 overflow-y-auto">
                          {customers
                            .filter((c) => c.name.toLowerCase().includes((customerSearch[entry.id] ?? "").toLowerCase()))
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => selectCustomer(entry.id, c)}
                                className="w-full text-left px-3 py-2.5 hover:bg-pink-50 text-sm text-gray-700 transition-all"
                              >
                                {c.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={entry.quantity}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateEntry(entry.id, "quantity", v === "" ? 0 : Math.max(1, parseInt(v) || 1));
                      }}
                      className="w-16 px-2 py-2.5 bg-pink-50/50 border border-pink-100 rounded-xl text-sm text-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-pink-200"
                    />
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-all shrink-0"
                    >
                      <Trash2 className="w-4 h-4 text-red-300 hover:text-red-500" />
                    </button>
                  </div>
                  <input
                    type="tel"
                    required
                    value={entry.phone}
                    onChange={(e) => updateEntry(entry.id, "phone", e.target.value)}
                    placeholder="No. telepon (wajib) — utk cocokkan pelanggan lama"
                    className="w-full mt-2 px-3 py-2 bg-pink-50/50 border border-pink-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />
                  {selectedProduct && price && (
                    (() => {
                      const q = Math.max(1, entry.quantity || 1);
                      const dp = getBulkPrice(q);
                      const unitPrice = dp ?? (parseInt(price.replace(/\D/g, "")) || 0);
                      return (
                        <p className="text-xs text-gray-400 mt-1.5 ml-7">
                          Subtotal: Rp {(unitPrice * q).toLocaleString("id-ID")}
                          {dp !== null && (
                            <span className="text-green-500 font-semibold">
                              {" · "}Rp {dp}/pcs (diskon)
                            </span>
                          )}
                        </p>
                      );
                    })()
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addEntry}
              className="mt-2 w-full py-3 bg-pink-50 hover:bg-pink-100 border border-dashed border-pink-200 rounded-2xl text-sm font-semibold text-pink-400 hover:text-pink-500 transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Tambah Pelanggan
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !productId || !price || entries.some((e) => !e.name.trim() || !e.phone.trim())}
            className="w-full py-4 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 disabled:from-gray-200 disabled:to-gray-200 text-white disabled:text-gray-400 font-bold rounded-2xl transition-all shadow-lg shadow-pink-200/40 text-base"
          >
            {loading ? "Membuat order..." : `Buat ${entries.length} Order`}
          </button>
        </div>
      </main>
    </div>
  );
}
