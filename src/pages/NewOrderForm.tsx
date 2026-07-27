import { useEffect, useState } from "react";
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
} from "lucide-react";

interface OrderItemInput {
  product_id: string;
  product_name: string;
  price: string;
  quantity: string;
  discount: string;
}

const emptyItem: OrderItemInput = {
  product_id: "",
  product_name: "",
  price: "",
  quantity: "1",
  discount: "",
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
  const { addStandaloneOrder, products, loadProducts, customers, loadCustomers, productDiscounts, loadAllProductDiscounts, accounts, loadAccounts } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo;

  useEffect(() => {
    loadProducts();
    loadCustomers();
    loadAllProductDiscounts();
    loadAccounts();
  }, []);

  const [orderType, setOrderType] = useState<OrderType>("penjualan");
  const [contactName, setContactName] = useState((location.state as any)?.contactName || "");
  const [items, setItems] = useState<OrderItemInput[]>([{ ...emptyItem }]);
  const [paymentType, setPaymentType] = useState<PaymentType>("tf");
  const [paidTotal, setPaidTotal] = useState("0");
  const [ongkir, setOngkir] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");

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
  const subtotalAfter = subtotalBeforeDiscount - totalDiscount + ongkirVal;
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
      }));

    if (validItems.length === 0) return;

    await addStandaloneOrder({
      orderType,
      paymentType,
      contactName: contactName.trim(),
      items: validItems,
      paidTotal: paid,
      ongkir: ongkirVal,
      notes: notes.trim(),
      accountId: accountId || undefined,
    });
    navigate(returnTo || "/orders");
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

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Kontak <span className="text-red-400">*</span>
            </label>
            <select
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
              className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
            >
              <option value="" disabled>-- Pilih Pelanggan / Supplier --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} ({c.category})
                </option>
              ))}
            </select>
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
                        <select
                          value={item.product_id}
                          onChange={(e) => {
                            if (e.target.value)
                              selectProduct(index, e.target.value);
                          }}
                          className="w-full px-4 py-3 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-700 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 appearance-none mb-2"
                        >
                          <option value="">Pilih dari inventaris...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {product && (
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
                            {(() => {
                              const qty = parseInt(item.quantity) || 0;
                              const discPrice = orderType === "penjualan" ? getDiscountPrice(item.product_id, qty) : null;
                              return (
                                <div className="text-center">
                                  {discPrice && qty >= 1 ? (
                                    <div>
                                      <span className="text-xs text-gray-400 line-through">{formatRp(product.sell_price)}</span>
                                      <span className="block text-base font-bold text-amber-600">{formatRp(discPrice)}</span>
                                    </div>
                                  ) : (
                                    <input
                                      type="text"
                                      value={formatRp(orderType === "penjualan" ? product.sell_price : product.cost_price)}
                                      readOnly
                                      className="w-full px-4 py-2.5 bg-gray-50 border border-pink-100 rounded-xl text-gray-500 text-base text-center"
                                    />
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
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
                  onClick={() => setPaymentType(opt.value)}
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
