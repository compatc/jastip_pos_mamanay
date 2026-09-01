import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../stores/useStore";
import type { OrderType, PaymentType } from "../types";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Truck,
  Percent,
  Search,
} from "lucide-react";

interface OrderItemInput {
  product_id: string;
  product_name: string;
  price: string;
  quantity: string;
  discount: string;
  variant?: string;
  unit_cost?: string;
}

const emptyItem: OrderItemInput = {
  product_id: "",
  product_name: "",
  price: "",
  quantity: "1",
  discount: "",
  unit_cost: "",
};

const PAYMENT_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "tf", label: "TF" },
  { value: "qris", label: "QRIS" },
  { value: "split", label: "Split" },
  { value: "shopee", label: "Shopee" },
];

function formatRp(n: number): string {
  return n.toLocaleString("id-ID");
}

export default function NewOrderForm() {
  const { addStandaloneOrder, products, loadProducts, customers, loadCustomers, productDiscounts, loadAllProductDiscounts, accounts, loadAccounts, addCustomer, addProduct, productVariants, loadProductVariants } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo;

  const [orderType, setOrderType] = useState<OrderType>("penjualan");
  const [contactName, setContactName] = useState((location.state as any)?.contactName || "");
  const [items, setItems] = useState<OrderItemInput[]>([{ ...emptyItem }]);
  const [paymentType, setPaymentType] = useState<PaymentType>("tf");
  const [paidTotal, setPaidTotal] = useState("0");
  const [ongkir, setOngkir] = useState("");
  const [diskon, setDiskon] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [contactSearch, setContactSearch] = useState((location.state as any)?.contactName || "");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  const [productSearchMap, setProductSearchMap] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<number | null>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProducts();
    loadCustomers();
    loadAllProductDiscounts();
    loadAccounts();
    loadProductVariants();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (contactRef.current && !contactRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (paymentType === "tf" && !accountId && accounts.length > 0) {
      const bankAcc = accounts.find((a) => a.name.toLowerCase().includes("bca")) || accounts.find((a) => a.type === "bank");
      if (bankAcc) setAccountId(bankAcc.id);
    }
  }, [paymentType, accounts]);

  function getDiscountPrice(productId: string, qty: number): number | null {
    const discounts = productDiscounts
      .filter((d) => d.product_id === productId && d.min_qty <= qty)
      .sort((a, b) => b.min_qty - a.min_qty);
    return discounts.length > 0 ? discounts[0].discount_price : null;
  }

  function addItem() {
    setItems([...items, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const qty = 1;
    const discountPrice = getDiscountPrice(productId, qty);
    const price =
      orderType === "penjualan"
        ? (discountPrice ?? product.sell_price)
        : product.cost_price;
    const updated = [...items];
    updated[index] = {
      product_id: product.id,
      product_name: product.name,
      price: price.toString(),
      quantity: qty.toString(),
      discount: "",
      variant: "",
    };
    setItems(updated);
  }

  function updateItemQty(index: number, qty: string) {
    const updated = [...items];
    updated[index] = { ...updated[index], quantity: qty };
    const item = updated[index];
    if (item.product_id && orderType === "penjualan") {
      const product = products.find((p) => p.id === item.product_id);
      if (product) {
        const q = parseInt(qty) || 0;
        const discountPrice = getDiscountPrice(item.product_id, q);
        updated[index] = {
          ...updated[index],
          price: (discountPrice ?? product.sell_price).toString(),
        };
      }
    }
    setItems(updated);
  }

  function handleOrderTypeChange(type: OrderType) {
    setOrderType(type);
    const updated = items.map((item) => {
      if (!item.product_id) return item;
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return item;
      return {
        ...item,
        price: (
          type === "penjualan" ? product.sell_price : product.cost_price
        ).toString(),
      };
    });
    setItems(updated);
  }

  const subtotalBeforeDiscount = items.reduce(
    (sum, i) => sum + (parseFloat(i.price) || 0) * (parseInt(i.quantity) || 0),
    0
  );
  const totalDiscount = items.reduce(
    (sum, i) => sum + (parseFloat(i.discount) || 0),
    0
  );
  const ongkirVal = parseFloat(ongkir) || 0;
  const diskonVal = parseFloat(diskon) || 0;
  const subtotalAfter = subtotalBeforeDiscount - totalDiscount - diskonVal + ongkirVal;
  const paid = parseFloat(paidTotal) || 0;
  const total = subtotalAfter - paid;

  function getStockWarning(item: OrderItemInput): string | null {
    if (orderType !== "penjualan") return null;
    if (!item.product_id) return null;
    const product = products.find((p) => p.id === item.product_id);
    if (!product) return null;
    const qty = parseInt(item.quantity) || 0;
    if (qty > product.stock) {
      return `Melebihi stok yang tersedia (stok: ${product.stock} ${product.unit})`;
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!contactName.trim()) {
      alert("Nama kontak wajib dipilih!");
      return;
    }

    const validItems = items
      .filter(
        (i) =>
          i.product_id &&
          i.product_name.trim() &&
          (parseFloat(i.price) || 0) > 0 &&
          (parseInt(i.quantity) || 0) > 0
      )
      .map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name.trim(),
        price: parseFloat(i.price),
        quantity: parseInt(i.quantity) || 1,
        discount: parseFloat(i.discount) || 0,
        variant: i.variant || "",
        unit_cost: orderType === "pembelian" ? (parseFloat(i.unit_cost || "") || undefined) : undefined,
      }));

    if (validItems.length === 0) return;

    try {
      await addStandaloneOrder({
        orderType,
        paymentType,
        contactName: contactName.trim(),
        items: validItems,
        paidTotal: paid,
        ongkir: ongkirVal,
        diskon: diskonVal,
        notes: notes.trim(),
        accountId: accountId || undefined,
      });
      navigate(returnTo || "/orders");
    } catch (err: any) {
      alert("Gagal membuat order: " + (err?.message || err));
    }
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-pink-50 via-white to-rose-50">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-200/30 rounded-full blur-3xl" />
      </div>

      <header className="shrink-0 bg-white/70 backdrop-blur-xl border-b border-pink-100/60 relative z-10">
        <div className="px-5 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 hover:bg-pink-50 rounded-xl transition-all border border-pink-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Order Baru</h1>
        </div>
      </header>

      <form
        id="new-order-form"
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto relative z-10"
      >
        <div className="px-5 py-4 space-y-4 pb-8">
          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Tipe Order
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleOrderTypeChange("penjualan")}
                className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${
                  orderType === "penjualan"
                    ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                    : "bg-pink-50 text-gray-400 border border-pink-100"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Penjualan
              </button>
              <button
                type="button"
                onClick={() => handleOrderTypeChange("pembelian")}
                className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${
                  orderType === "pembelian"
                    ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                    : "bg-pink-50 text-gray-400 border border-pink-100"
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                Pembelian
              </button>
            </div>
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50 relative" ref={contactRef}>
            <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Kontak <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => {
                setContactSearch(e.target.value);
                setContactName("");
                setShowContactDropdown(true);
              }}
              onFocus={() => setShowContactDropdown(true)}
              placeholder="Cari atau ketik nama baru..."
              required
              className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
            />
            {showContactDropdown && (
              <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-pink-100 rounded-2xl shadow-xl shadow-pink-100/30 z-50 max-h-52 overflow-y-auto">
                {customers
                  .filter((c) =>
                    c.name.toLowerCase().includes(contactSearch.toLowerCase())
                  )
                  .slice(0, 10)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setContactName(c.name);
                        setContactSearch(c.name);
                        setShowContactDropdown(false);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-pink-50 transition-all first:rounded-t-2xl"
                    >
                      <span className="text-sm font-semibold text-gray-700">{c.name}</span>
                      <span className="text-xs text-gray-400 bg-pink-50 px-2 py-0.5 rounded-full">{c.category}</span>
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={async () => {
                    const name = contactSearch.trim();
                    if (!name) return;
                    const cat = orderType === "penjualan" ? "pelanggan" : "supplier";
                    await addCustomer(name, "", "", cat);
                    setContactName(name);
                    setShowContactDropdown(false);
                    await loadCustomers();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-pink-50 transition-all text-pink-500 font-semibold text-sm border-t border-pink-50 last:rounded-b-2xl"
                >
                  <span className="w-5 h-5 rounded-full bg-pink-100 flex items-center justify-center text-xs">+</span>
                  Tambah "{contactSearch.trim()}" sebagai {orderType === "penjualan" ? "Pelanggan" : "Supplier"}
                </button>
                {customers.filter((c) => c.name.toLowerCase().includes(contactSearch.toLowerCase())).length === 0 && !contactSearch.trim() && (
                  <p className="px-4 py-3 text-sm text-gray-400">Ketik nama untuk mencari...</p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Item
            </label>
            <div className="space-y-3">
              {items.map((item, index) => {
                const warning = getStockWarning(item);
                const product = products.find(
                  (p) => p.id === item.product_id
                );
                return (
                  <div key={index}>
                    <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                          Item #{index + 1}
                        </span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4 text-red-300 hover:text-red-500" />
                          </button>
                        )}
                      </div>

                      {products.length > 0 && (
                        <div className="relative mb-2" ref={productDropdownRef}>
                          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                          <input
                            type="text"
                            value={productSearchMap[index] ?? item.product_name}
                            onChange={(e) => {
                              setProductSearchMap({ ...productSearchMap, [index]: e.target.value });
                              setShowProductDropdown(index);
                            }}
                            onFocus={() => setShowProductDropdown(index)}
                            placeholder="Cari produk..."
                            className="w-full pl-10 pr-4 py-3 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-700 text-base focus:outline-none focus:ring-2 focus:ring-pink-200"
                          />
                          {showProductDropdown === index && (
                            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-pink-100 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                              {products
                                .filter((p) => {
                                  const search = (productSearchMap[index] ?? "").toLowerCase();
                                  return !search || p.name.toLowerCase().includes(search);
                                })
                                .map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      selectProduct(index, p.id);
                                      setProductSearchMap({ ...productSearchMap, [index]: p.name });
                                      setShowProductDropdown(null);
                                    }}
                                    className="w-full text-left px-4 py-3 hover:bg-pink-50 text-sm text-gray-700 transition-all first:rounded-t-2xl last:rounded-b-2xl"
                                  >
                                    {p.name}
                                  </button>
                                ))}
                              {products.filter((p) => {
                                const search = (productSearchMap[index] ?? "").toLowerCase();
                                return !search || p.name.toLowerCase().includes(search);
                              }).length === 0 && (
                                <div>
                                  <p className="px-4 py-3 text-sm text-gray-400 text-center">Tidak ditemukan</p>
                                  {(productSearchMap[index] ?? "").trim() && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const name = (productSearchMap[index] ?? "").trim();
                                        const id = await addProduct(name, 0, 0, 0, "PCS", "");
                                        if (id) {
                                          await loadProducts();
                                          selectProduct(index, id);
                                          setProductSearchMap({ ...productSearchMap, [index]: name });
                                          setShowProductDropdown(null);
                                        }
                                      }}
                                      className="w-full text-left px-4 py-3 hover:bg-pink-50 text-sm font-semibold text-pink-600 border-t border-pink-100 transition-all flex items-center gap-2"
                                    >
                                      <Plus className="w-4 h-4" />
                                      Tambah "{productSearchMap[index]?.trim()}"
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {product && (
                        <>
                          {(() => {
                            const variants = productVariants.filter((v) => v.product_id === product.id);
                            if (variants.length === 0) return null;
                            return (
                              <div className="mb-2">
                                <label className="block text-xs text-gray-300 uppercase tracking-wider font-semibold mb-1">
                                  Varian
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                  {variants.map((v) => (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => {
                                        const updated = [...items];
                                        updated[index] = { ...updated[index], variant: v.name };
                                        setItems(updated);
                                      }}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                                        item.variant === v.name
                                          ? "bg-pink-100 border-pink-400 text-pink-700"
                                          : "bg-white border-pink-100 text-gray-500 hover:border-pink-300"
                                      }`}
                                    >
                                      {v.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1">
                              <label className="block text-xs text-gray-300 uppercase tracking-wider font-semibold mb-1">
                                Stok
                              </label>
                              <input
                                type="text"
                                value={`${product.stock} ${product.unit}`}
                                readOnly
                                className="w-full px-4 py-2.5 bg-gray-50 border border-pink-100 rounded-xl text-gray-500 text-base text-center"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-gray-300 uppercase tracking-wider font-semibold mb-1">
                              Harga
                            </label>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 text-sm">Rp</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={item.price}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, "");
                                  const updated = [...items];
                                  updated[index] = { ...updated[index], price: val };
                                  setItems(updated);
                                }}
                                placeholder={(orderType === "penjualan" ? product.sell_price : product.cost_price).toString()}
                                className="flex-1 px-3 py-2.5 bg-pink-50/50 border border-pink-100 rounded-xl text-gray-800 text-base text-center focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                              />
                            </div>
                            {(() => {
                              const defaultPrice = orderType === "penjualan" ? product.sell_price : product.cost_price;
                              return defaultPrice > 0 && (!item.price || parseInt(item.price) !== defaultPrice) ? (
                                <p className="text-xs text-gray-400 mt-0.5 text-center">Default: {formatRp(defaultPrice)}</p>
                              ) : null;
                            })()}
                          </div>
                        </div>
                        </>
                      )}

                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-300 uppercase tracking-wider font-semibold mb-1">
                            Qty
                          </label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItemQty(index, e.target.value)
                            }
                            min="1"
                            className="w-full px-4 py-2.5 bg-pink-50/50 border border-pink-100 rounded-xl text-gray-800 text-base text-center focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-gray-300 uppercase tracking-wider font-semibold mb-1">
                            Disc
                          </label>
                          <input
                            type="number"
                            value={item.discount}
                            onChange={(e) => {
                              const updated = [...items];
                              updated[index] = { ...updated[index], discount: e.target.value };
                              setItems(updated);
                            }}
                            onFocus={() => {
                              if (item.discount === "0") {
                                const updated = [...items];
                                updated[index] = { ...updated[index], discount: "" };
                                setItems(updated);
                              }
                            }}
                            min="0"
                            className="w-full px-4 py-2.5 bg-pink-50/50 border border-pink-100 rounded-xl text-gray-800 text-base text-center focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                          />
                        </div>
                      </div>
                      {orderType === "pembelian" && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-300 uppercase tracking-wider font-semibold mb-1">
                              Harga Modal / pcs
                            </label>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 text-sm">Rp</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={item.unit_cost || ""}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, "");
                                  const updated = [...items];
                                  updated[index] = { ...updated[index], unit_cost: val, price: val || updated[index].price };
                                  setItems(updated);
                                }}
                                placeholder="0"
                                className="flex-1 px-3 py-2.5 bg-amber-50/50 border border-amber-100 rounded-xl text-gray-800 text-base text-center focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {warning && (
                      <div className="flex items-center gap-2 px-4 py-2 mt-1">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-amber-500 text-base font-medium">
                          {warning}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="w-full mt-3 py-4 border-2 border-dashed border-pink-200 hover:border-pink-300 text-gray-400 hover:text-pink-400 rounded-2xl font-medium text-base flex items-center justify-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              Tambah Item
            </button>
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="flex items-center gap-2 text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              <Truck className="w-4 h-4" />
              Ongkir
            </label>
            <input
              type="number"
              value={ongkir}
              onChange={(e) => setOngkir(e.target.value)}
              onFocus={() => { if (ongkir === "0") setOngkir(""); }}
              placeholder="0"
              min="0"
              className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
            />
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="flex items-center gap-2 text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              <Percent className="w-4 h-4" />
              Diskon
            </label>
            <input
              type="number"
              value={diskon}
              onChange={(e) => setDiskon(e.target.value)}
              onFocus={() => { if (diskon === "0") setDiskon(""); }}
              placeholder="0"
              min="0"
              className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
            />
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 100))}
              placeholder="Catatan (maks 100 karakter)"
              maxLength={100}
              className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
            />
            <p className="text-xs text-gray-300 text-right mt-1">
              {notes.length}/100
            </p>
          </div>

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Jenis Pembayaran
            </label>
            <div className="flex gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setPaymentType(opt.value);
                    if (opt.value === "tf") {
                      const bankAcc = accounts.find((a) => a.name.toLowerCase().includes("bca")) || accounts.find((a) => a.type === "bank");
                      if (bankAcc && !accountId) setAccountId(bankAcc.id);
                    }
                  }}
                  className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all ${
                    paymentType === opt.value
                      ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                      : "bg-pink-50 text-gray-400 border border-pink-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
              <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                Akun Penerima
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAccountId("")}
                  className={`px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
                    accountId === ""
                      ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                      : "bg-pink-50 text-gray-400 border border-pink-100"
                  }`}
                >
                  Tidak ada
                </button>
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccountId(a.id)}
                    className={`flex-1 px-3 py-3 rounded-2xl text-sm font-semibold transition-all ${
                      accountId === a.id
                        ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                        : "bg-pink-50 text-gray-400 border border-pink-100"
                    }`}
                  >
                    {a.icon} {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 space-y-3 shadow-sm shadow-pink-50">
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-400 font-medium">Subtotal</span>
              <span className="text-base text-gray-800 font-semibold">
                Rp {formatRp(subtotalBeforeDiscount)}
              </span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-400 font-medium">Diskon</span>
                <span className="text-base text-red-400 font-semibold">
                  - Rp {formatRp(totalDiscount)}
                </span>
              </div>
            )}
            {ongkirVal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-400 font-medium">Ongkir</span>
                <span className="text-base text-gray-800 font-semibold">
                  Rp {formatRp(ongkirVal)}
                </span>
              </div>
            )}
            {diskonVal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-400 font-medium">Diskon Total</span>
                <span className="text-base text-red-400 font-semibold">
                  - Rp {formatRp(diskonVal)}
                </span>
              </div>
            )}
            <div className="border-t border-pink-100 pt-3 flex items-center justify-between">
              <span className="text-gray-400 font-medium uppercase text-xs tracking-wider">Total</span>
              <span className="text-base text-gray-800 font-bold">
                Rp {formatRp(subtotalAfter)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-base text-gray-400 font-medium shrink-0">Sudah Dibayar</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaidTotal(subtotalAfter.toString())}
                  className="px-3 py-2.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-200/40 active:scale-95"
                >
                  Bayar
                </button>
                <input
                  type="number"
                  value={paidTotal}
                  onChange={(e) => setPaidTotal(e.target.value)}
                  min="0"
                  className="w-48 px-4 py-2.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 text-base text-right focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                />
              </div>
            </div>
            <div className="border-t border-pink-100 pt-3 flex items-center justify-between">
              <span className="text-gray-400 font-medium uppercase text-xs tracking-wider">Status Pembayaran</span>
              <span className="text-2xl font-bold">
                {subtotalAfter === 0 ? (
                  <span />
                ) : total === 0 ? (
                  <span className="text-emerald-500">Lunas</span>
                ) : total > 0 ? (
                  <span className="text-yellow-500">kurang Rp {formatRp(total)}</span>
                ) : (
                  <span className="text-yellow-500">lebih Rp {formatRp(Math.abs(total))}</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </form>

      <div className="shrink-0 px-5 py-3 bg-white/80 backdrop-blur-xl border-t border-pink-100/60 relative z-10">
        <button
          type="submit"
          form="new-order-form"
          className="w-full py-4 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-pink-200/40 active:scale-[0.98]"
        >
          <Check className="w-5 h-5" />
          Buat Order
        </button>
      </div>
    </div>
  );
}
