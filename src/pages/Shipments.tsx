import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import {
  ArrowLeft,
  Package,
  Truck,
  Clock,
  MessageCircle,
  CheckCircle2,
  Undo2,
} from "lucide-react";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function shortId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return "NAY" + String(Math.abs(hash) % 10000).padStart(4, "0");
}

interface OrderItemData {
  product_name: string;
  quantity: number;
  price: number;
  stock: number;
}

interface ShipmentOrder {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  total: number;
  paid_total: number;
  notes: string;
  created_at: string;
  items: OrderItemData[];
  isHold: boolean;
  holdReason: string;
}

type FilterType = "all" | "ready" | "hold";

function isOrderLunas(o: { paid_total: number; total: number }) {
  return (o.paid_total || 0) >= (o.total || 0) && o.total > 0;
}

function isHold(notes: string): boolean {
  return notes?.includes("[DITUNDA]");
}

function getHoldReason(notes: string): string {
  const match = notes?.match(/\[DITUNDA\]\s*(.*)/);
  return match ? match[1] : "";
}

export default function Shipments() {
  const navigate = useNavigate();
  const { allOrders, loadAllOrders, customers, loadCustomers } = useStore();
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemData[]>>({});
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<number>>>({});
  const [search, setSearch] = useState("");

  function toggleItemCheck(orderId: string, itemIdx: number) {
    setCheckedItems((prev) => {
      const orderSet = new Set(prev[orderId] || []);
      if (orderSet.has(itemIdx)) orderSet.delete(itemIdx);
      else orderSet.add(itemIdx);
      return { ...prev, [orderId]: orderSet };
    });
  }

  useEffect(() => {
    loadAllOrders();
    loadCustomers();
  }, []);

  useEffect(() => {
    if (allOrders.length === 0) return;
    async function loadAllItems() {
      const ids = allOrders.map((o) => o.id);
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity, price")
        .in("order_id", ids);

      const { data: products } = await supabase
        .from("products")
        .select("name, stock");

      const stockMap: Record<string, number> = {};
      if (products) {
        for (const p of products) {
          stockMap[p.name] = p.stock || 0;
        }
      }

      if (!items) return;
      const map: Record<string, OrderItemData[]> = {};
      for (const row of items) {
        if (!map[row.order_id]) map[row.order_id] = [];
        map[row.order_id].push({
          product_name: row.product_name,
          quantity: row.quantity,
          price: row.price,
          stock: stockMap[row.product_name] || 0,
        });
      }
      setItemsByOrder(map);
      setLoading(false);
    }
    loadAllItems();
  }, [allOrders]);

  const lunasOrders = allOrders.filter(
    (o) =>
      o.order_type === "penjualan" &&
      isOrderLunas(o) &&
      !["shipped", "delivered", "completed", "deleted"].includes(o.status)
  );

  const customerMap: Record<string, { name: string; phone: string }> = {};
  for (const c of customers) {
    customerMap[c.id] = { name: c.name, phone: c.phone };
  }

  const grouped: Record<string, ShipmentOrder[]> = {};
  for (const o of lunasOrders) {
    const custId = o.customer_id || "__none__";
    if (!grouped[custId]) grouped[custId] = [];
    const items = itemsByOrder[o.id] || [];
    const hold = isHold(o.notes);
    grouped[custId].push({
      ...o,
      customer_name: customerMap[custId]?.name || "Tanpa Nama",
      customer_phone: customerMap[custId]?.phone || "",
      items,
      isHold: hold,
      holdReason: getHoldReason(o.notes),
    });
  }

  const customerGroups = Object.entries(grouped)
    .map(([custId, orders]) => ({
      custId,
      name: orders[0].customer_name,
      phone: orders[0].customer_phone,
      orders,
      totalItems: orders.reduce(
        (s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0),
        0
      ),
      hasHold: orders.some((o) => o.isHold),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredGroups = customerGroups.filter((g) => {
    if (filter === "ready" && g.hasHold) return false;
    if (filter === "hold" && !g.hasHold) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchName = g.name.toLowerCase().includes(q);
      const matchItem = g.orders.some((o) =>
        o.items.some((i) => i.product_name.toLowerCase().includes(q))
      );
      const matchId = g.orders.some((o) => shortId(o.id).toLowerCase().includes(q));
      if (!matchName && !matchItem && !matchId) return false;
    }
    return true;
  });

  const totalOrders = lunasOrders.length;
  const totalItems = lunasOrders.reduce(
    (s, o) => s + (itemsByOrder[o.id] || []).reduce((s2, i) => s2 + i.quantity, 0),
    0
  );
  const holdCount = customerGroups.filter((g) => g.hasHold).length;

  async function toggleHold(order: ShipmentOrder) {
    const newNotes = order.isHold
      ? order.notes.replace(/\[DITUNDA\]\s*.*/, "").trim()
      : `${order.notes ? order.notes + "\n" : ""}[DITUNDA] menunggu stok`;
    await supabase
      .from("orders")
      .update({ notes: newNotes, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    loadAllOrders();
  }

  async function markShipped(orderIds: string[]) {
    await supabase
      .from("orders")
      .update({ status: "shipped", updated_at: new Date().toISOString() })
      .in("id", orderIds);
    loadAllOrders();
  }

  function sendWhatsApp(phone: string, customerName: string, orders: ShipmentOrder[]) {
    if (!phone) return;
    let msg = `Halo Kak ${customerName} 👋\n\n`;
    msg += "Kami mau info pesanan Kakak sudah siap dikirim:\n\n";
    for (const o of orders) {
      const itemNames = o.items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ");
      msg += `📦 ${shortId(o.id)}: ${itemNames}\n`;
    }
    msg += `\nKalau sudah oke, kami kirim ya! 🚚`;
    const cleaned = phone.replace(/\D/g, "");
    const wa = cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned.startsWith("62") ? cleaned : "62" + cleaned;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="h-full flex flex-col relative z-10">
      <main className="flex-1 px-4 py-4 max-w-7xl w-full mx-auto overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/orders")}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-800">Kirim Barang</h1>
            <p className="text-sm text-slate-400">Order lunas yang belum dikirim</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
            <div className="text-xl font-extrabold text-pink-500">{customerGroups.length}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Pelanggan</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
            <div className="text-xl font-extrabold text-blue-500">{totalOrders}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Order</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
            <div className="text-xl font-extrabold text-orange-500">{totalItems}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Item</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pelanggan atau item..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
          {([
            ["all", "Semua"],
            ["ready", "Siap Kirim"],
            ["hold", "⏳ Tunda"],
          ] as [FilterType, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${
                filter === key
                  ? key === "hold"
                    ? "bg-amber-400 text-amber-900 border-amber-400"
                    : "bg-pink-500 text-white border-pink-500"
                  : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {label} ({key === "hold" ? holdCount : key === "ready" ? customerGroups.length - holdCount : customerGroups.length})
            </button>
          ))}
        </div>

        {/* Customer Groups */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-pink-50 border border-pink-100 rounded-2xl flex items-center justify-center mb-4">
              <Truck className="w-7 h-7 text-pink-300" />
            </div>
            <p className="text-gray-500 font-semibold">Tidak ada barang perlu dikirim</p>
            <p className="text-gray-300 text-sm mt-1">Semua order sudah terkirim</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((group) => (
              <div key={group.custId} className="space-y-2">
                {/* Customer Header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 text-white flex items-center justify-center text-base font-extrabold shrink-0">
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800">{group.name}</div>
                    <div className="text-xs text-slate-400">
                      {group.orders.length} order · {group.totalItems} item
                    </div>
                  </div>
                  {group.hasHold ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Tunda
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-600">
                      ✓ Siap
                    </span>
                  )}
                </div>

                {/* Orders */}
                {group.orders.map((order) => (
                  <div
                    key={order.id}
                    className={`border rounded-xl p-3 ${
                      order.isHold
                        ? "bg-amber-50 border-amber-200"
                        : "bg-white border-slate-100"
                    }`}
                  >
                    {/* Order top */}
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{shortId(order.id)}</span>
                        <span className="text-xs text-slate-400">
                          {new Date(order.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          order.status === "ready"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {order.status === "ready" ? "Ready" : "Dibayar"}
                      </span>
                    </div>

                    {/* Hold badge */}
                    {order.isHold && (
                      <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-amber-100 border border-dashed border-amber-300 rounded-lg text-xs text-amber-700">
                        <Clock className="w-3 h-3" />
                        <span className="font-semibold">Ditunda</span>
                        {order.holdReason && (
                          <span className="text-amber-500">— {order.holdReason}</span>
                        )}
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-1">
                      {order.items.map((item, idx) => {
                        const notReady = item.stock <= 0;
                        const isChecked = checkedItems[order.id]?.has(idx) || false;
                        return (
                          <div
                            key={idx}
                            onClick={() => !notReady && toggleItemCheck(order.id, idx)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all ${
                              notReady && order.isHold
                                ? "bg-amber-100 border border-dashed border-amber-300"
                                : isChecked
                                ? "bg-emerald-50 border border-emerald-200"
                                : "bg-slate-50 border border-transparent"
                            } ${!notReady ? "cursor-pointer active:bg-slate-100" : ""}`}
                          >
                            {/* Checkbox */}
                            {!notReady ? (
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                isChecked
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "border-slate-300 bg-white"
                              }`}>
                                {isChecked && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-md border-2 border-amber-300 bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-amber-500 text-xs">⏳</span>
                              </div>
                            )}
                            <span className={`flex-1 font-medium ${
                              notReady && order.isHold
                                ? "text-amber-800"
                                : isChecked
                                ? "text-emerald-700 line-through"
                                : "text-slate-700"
                            }`}>
                              {item.product_name}
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              notReady && order.isHold
                                ? "bg-amber-200 text-amber-800"
                                : isChecked
                                ? "bg-emerald-200 text-emerald-700"
                                : "bg-slate-200 text-slate-600"
                            }`}>
                              ×{item.quantity}
                            </span>
                            {notReady && order.isHold && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-200 px-1.5 py-0.5 rounded">
                                Stok 0
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => toggleHold(order)}
                        className={`flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                          order.isHold
                            ? "bg-amber-200 text-amber-800 hover:bg-amber-300"
                            : "bg-amber-100 text-amber-600 hover:bg-amber-200"
                        }`}
                      >
                        {order.isHold ? (
                          <><Undo2 className="w-3 h-3" /> Batal Tunda</>
                        ) : (
                          <><Clock className="w-3 h-3" /> Tunda</>
                        )}
                      </button>
                      {!order.isHold && (() => {
                        const totalItems = order.items.length;
                        const checked = checkedItems[order.id]?.size || 0;
                        const allChecked = totalItems > 0 && checked === totalItems;
                        return (
                          <button
                            onClick={() => allChecked && markShipped([order.id])}
                            disabled={!allChecked}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-all ${
                              allChecked
                                ? "bg-pink-500 text-white hover:bg-pink-600"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            <Truck className="w-3 h-3" />
                            {allChecked ? "Kirim" : `Kirim (${checked}/${totalItems})`}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ))}

                {/* Customer actions */}
                <div className="flex gap-2 ml-13">
                  <button
                    onClick={() =>
                      sendWhatsApp(group.phone, group.name, group.orders.filter((o) => !o.isHold))
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 transition-all"
                  >
                    <MessageCircle className="w-3 h-3" /> WhatsApp
                  </button>
                  {group.orders.filter((o) => !o.isHold).length > 0 && (
                    <button
                      onClick={() =>
                        markShipped(group.orders.filter((o) => !o.isHold).map((o) => o.id))
                      }
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-pink-500 text-white hover:bg-pink-600 transition-all"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Kirim Semua
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
