import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useStore } from "../stores/useStore";
import type { OrderStatus, OrderType, PaymentType } from "../types";
import ConfirmationModal from "../components/ConfirmationModal";
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

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "new", label: "Baru" },
  { value: "paid", label: "Dibayar" },
  { value: "shipped", label: "Dikirim" },
  { value: "delivered", label: "Diterima" },
  { value: "completed", label: "Selesai" },
];

function formatRp(n: number): string {
  return n.toLocaleString("id-ID");
}

function shortId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return "NAY" + String(Math.abs(hash) % 10000).padStart(4, "0");
}

export default function EditOrderForm() {
  const { orderId } = useParams<{ orderId: string }>();
  const { updateOrder, allOrders, loadAllOrders, orderItems, loadOrderItems, products, loadProducts, customers, loadCustomers, productDiscounts, loadAllProductDiscounts } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo;

  const [orderType, setOrderType] = useState<OrderType>("penjualan");
  const [contactName, setContactName] = useState("");
  const [items, setItems] = useState<OrderItemInput[]>([{ ...emptyItem }]);
  const [paymentType, setPaymentType] = useState<PaymentType>("tf");
  const [paidTotal, setPaidTotal] = useState("0");
  const [ongkir, setOngkir] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<OrderStatus>("new");
  const [loading, setLoading] = useState(true);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmOnConfirm, setConfirmOnConfirm] = useState<(() => void) | null>(null);

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmOnConfirm(() => onConfirm);
    setConfirmVisible(true);
  }

  useEffect(() => {
    setLoading(true);
    setItemsLoaded(false);
    loadProducts();
    loadAllOrders();
    loadCustomers();
    loadAllProductDiscounts();
    async function load() {
      if (!orderId) return;
      await loadOrderItems(orderId);
      setItemsLoaded(true);
    }
    load();
  }, [orderId]);

  useEffect(() => {
    if (!orderId || allOrders.length === 0 || !itemsLoaded) return;

    const order = allOrders.find((o) => o.id === orderId);
    if (!order) return;

    setOrderType(order.order_type);
    setPaymentType(order.payment_type);
    setPaidTotal(order.paid_total.toString());
    setOngkir(order.ongkir > 0 ? order.ongkir.toString() : "");
    setNotes(order.notes || "");
    setStatus(order.status);

    if (order.customer_name) {
      setContactName(order.customer_name);
    } else if (order.customer_id) {
      const db = useStore.getState();
      const customers = db.customers || [];
      const customer = customers.find((c) => c.id === order.customer_id);
      if (customer) setContactName(customer.name);
    }

    const mappedItems: OrderItemInput[] = orderItems.map((oi) => {
      const product = oi.product_id
        ? products.find((p) => p.id === oi.product_id)
        : products.find((p) => p.name === oi.product_name);
      return {
        product_id: product?.id || oi.product_id || "",
        product_name: oi.product_name,
        price: oi.price.toString(),
        quantity: oi.quantity.toString(),
        discount: oi.discount > 0 ? oi.discount.toString() : "",
      };
    });
    setItems(mappedItems.length > 0 ? mappedItems : [{ ...emptyItem }]);

    setLoading(false);
  }, [orderId, allOrders, orderItems, products, itemsLoaded]);

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
    const price = orderType === "penjualan"
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

  function handleOrderTypeChange(type: OrderType) {
    setOrderType(type);
    const updated = items.map((item) => {
      if (!item.product_id) return item;
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return item;
      return {
        ...item,
        price: (type === "penjualan" ? product.sell_price : product.cost_price).toString(),
      };
    });
    setItems(updated);
  }

  const subtotalBeforeDiscount = items.reduce(
    (sum, i) => sum + (parseFloat(i.price) || 0) * (parseInt(i.quantity) || 0), 0
  );
  const totalDiscount = items.reduce(
    (sum, i) => sum + (parseFloat(i.discount) || 0), 0
  );
  const ongkirVal = parseFloat(ongkir) || 0;
  const subtotalAfter = subtotalBeforeDiscount - totalDiscount + ongkirVal;
  const paid = parseFloat(paidTotal) || 0;
  const total = subtotalAfter - paid;
  const isPaid = total <= 0;

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
    if (!orderId) return;

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

    if (status === "completed") {
      showConfirm("Selesaiin order ini?", "Apakah kamu yakin ingin menyelesaikan order ini?", async () => {
        await updateOrder(orderId, {
          status,
          orderType,
          paymentType,
          contactName: contactName.trim(),
          items: validItems,
          paidTotal: paid,
          ongkir: ongkirVal,
          notes: notes.trim(),
        });
        navigate(returnTo || "/orders");
      });
      return;
    }

    await updateOrder(orderId, {
      status,
      orderType,
      paymentType,
      contactName: contactName.trim(),
      items: validItems,
      paidTotal: paid,
      ongkir: ongkirVal,
      notes: notes.trim(),
    });
    navigate(returnTo || "/orders");
  }

  const order = allOrders.find((o) => o.id === orderId);

  const displayDate = order
    ? new Date(order.created_at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  const headerTitle = order
    ? `${shortId(order.id)} - ${order.customer_name || "Tanpa kontak"} - ${displayDate}`
    : "Edit Order";

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50">
        <div className="w-10 h-10 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
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
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 hover:bg-pink-50 rounded-xl transition-all border border-pink-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-800 truncate">{headerTitle}</h1>
          </div>
        </div>
      </header>

      <form
        id="edit-order-form"
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto relative z-10"
      >
        <div className="px-5 py-4 space-y-4 pb-8">
          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
            <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
              Status
            </label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const isCompleted = opt.value === "completed";
                const disabled = isCompleted && !isPaid;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => !disabled && setStatus(opt.value)}
                    disabled={disabled}
                    className={`flex-1 py-3 rounded-2xl text-sm font-semibold transition-all ${
                      status === opt.value
                        ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                        : disabled
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed opacity-50 border border-gray-200"
                          : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

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
                const product = products.find((p) => p.id === item.product_id);
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
                            if (e.target.value) selectProduct(index, e.target.value);
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
                            onChange={(e) => {
                              const updated = [...items];
                              updated[index] = { ...updated[index], quantity: e.target.value };
                              const item2 = updated[index];
                              if (item2.product_id && orderType === "penjualan") {
                                const p = products.find((pp) => pp.id === item2.product_id);
                                if (p) {
                                  const q = parseInt(e.target.value) || 0;
                                  const dp = getDiscountPrice(item2.product_id, q);
                                  updated[index] = { ...updated[index], price: (dp ?? p.sell_price).toString() };
                                }
                              }
                              setItems(updated);
                            }}
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
                        <span className="text-amber-500 text-base font-medium">{warning}</span>
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

          <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 space-y-3 shadow-sm shadow-pink-50">
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-400 font-medium">Subtotal</span>
              <span className="text-base text-gray-800 font-semibold">Rp {formatRp(subtotalBeforeDiscount)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-400 font-medium">Diskon</span>
                <span className="text-base text-red-400 font-semibold">- Rp {formatRp(totalDiscount)}</span>
              </div>
            )}
            {ongkirVal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-400 font-medium">Ongkir</span>
                <span className="text-base text-gray-800 font-semibold">Rp {formatRp(ongkirVal)}</span>
              </div>
            )}
            <div className="border-t border-pink-100 pt-3 flex items-center justify-between">
              <span className="text-gray-400 font-medium uppercase text-xs tracking-wider">Total</span>
              <span className="text-base text-gray-800 font-bold">Rp {formatRp(subtotalAfter)}</span>
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
                {total === 0 ? (
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
          form="edit-order-form"
          className="w-full py-4 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-pink-200/40 active:scale-[0.98]"
        >
          <Check className="w-5 h-5" />
          Simpan Perubahan
        </button>
      </div>

      <ConfirmationModal
        visible={confirmVisible}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Ya, Selesai"
        cancelLabel="Batal"
        onConfirm={() => confirmOnConfirm?.()}
        onCancel={() => setConfirmVisible(false)}
      />
    </div>
  );
}
