import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
} from "lucide-react";

type TabFilter = "all" | "penjualan" | "pembelian";

interface OrderRow {
  id: string;
  date: string;
  order_type: string;
  contact_name: string;
  total: number;
  paid_total: number;
  payment_type: string;
  items: { product_name: string; quantity: number; price: number; discount: number }[];
}

function rupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function SalesDashboard() {
  const [tab, setTab] = useState<TabFilter>("all");
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const { data: orders } = await supabase
      .from("orders")
      .select("id, status, total, paid_total, order_type, payment_type, ongkir, notes, created_at, customer_id")
      .neq("status", "deleted")
      .order("created_at", { ascending: false });

    if (!orders || orders.length === 0) {
      setAllOrders([]);
      setLoading(false);
      return;
    }

    const customerIds = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds.length > 0 ? customerIds : ["__none__"]);

    const customerMap: Record<string, string> = {};
    if (customers) {
      for (const c of customers) {
        customerMap[c.id] = c.name;
      }
    }

    const orderIds = orders.map((o) => o.id);
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("order_id, product_name, quantity, price, discount")
      .in("order_id", orderIds);

    const itemsByOrder: Record<string, OrderRow["items"]> = {};
    if (orderItems) {
      for (const item of orderItems) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push({
          product_name: item.product_name,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount || 0,
        });
      }
    }

    const rows: OrderRow[] = orders.map((o) => ({
      id: o.id,
      date: o.created_at.split("T")[0],
      order_type: o.order_type,
      contact_name: customerMap[o.customer_id] || "-",
      total: o.total,
      paid_total: o.paid_total,
      payment_type: o.payment_type,
      items: itemsByOrder[o.id] || [],
    }));

    setAllOrders(rows);
    setLoading(false);
  }

  const filtered = allOrders.filter((o) => {
    if (tab === "all") return true;
    return o.order_type === tab;
  });

  const totalPenjualan = allOrders
    .filter((o) => o.order_type === "penjualan")
    .reduce((s, o) => s + o.total, 0);

  const totalPembelian = allOrders
    .filter((o) => o.order_type === "pembelian")
    .reduce((s, o) => s + o.total, 0);

  const laba = totalPenjualan - totalPembelian;

  const groupedByDate: Record<string, OrderRow[]> = {};
  for (const o of filtered) {
    if (!groupedByDate[o.date]) groupedByDate[o.date] = [];
    groupedByDate[o.date].push(o);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      <main className="px-5 py-4 relative z-10 flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
                <p className="text-base text-gray-400 uppercase tracking-wider font-semibold">
                  Penjualan
                </p>
                <p className="text-base font-bold text-emerald-600 mt-1">
                  {rupiah(totalPenjualan)}
                </p>
              </div>
              <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  </div>
                </div>
                <p className="text-base text-gray-400 uppercase tracking-wider font-semibold">
                  Pembelian
                </p>
                <p className="text-base font-bold text-red-500 mt-1">
                  {rupiah(totalPembelian)}
                </p>
              </div>
              <div className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-pink-500" />
                  </div>
                </div>
                <p className="text-base text-gray-400 uppercase tracking-wider font-semibold">
                  Laba
                </p>
                <p
                  className={`text-base font-bold mt-1 ${
                    laba >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {rupiah(laba)}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setTab("all")}
                className={`px-4 py-2 rounded-xl text-base font-semibold transition-all ${
                  tab === "all"
                    ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                    : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
                }`}
              >
                Semua ({allOrders.length})
              </button>
              <button
                onClick={() => setTab("penjualan")}
                className={`px-4 py-2 rounded-xl text-base font-semibold transition-all flex items-center gap-1.5 ${
                  tab === "penjualan"
                    ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                    : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
                }`}
              >
                <ShoppingCart className="w-3 h-3" />
                Penjualan ({allOrders.filter((o) => o.order_type === "penjualan").length})
              </button>
              <button
                onClick={() => setTab("pembelian")}
                className={`px-4 py-2 rounded-xl text-base font-semibold transition-all flex items-center gap-1.5 ${
                  tab === "pembelian"
                    ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                    : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
                }`}
              >
                <Package className="w-3 h-3" />
                Pembelian ({allOrders.filter((o) => o.order_type === "pembelian").length})
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-5">
                  <DollarSign className="w-8 h-8 text-pink-300" />
                </div>
                <p className="text-gray-500 text-xl font-medium">
                  Belum ada data
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(groupedByDate).map(([date, orders]) => {
                  const dayPenjualan = orders
                    .filter((o) => o.order_type === "penjualan")
                    .reduce((s, o) => s + o.total, 0);
                  const dayPembelian = orders
                    .filter((o) => o.order_type === "pembelian")
                    .reduce((s, o) => s + o.total, 0);
                  return (
                    <div key={date}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-bold text-gray-700">
                          {new Date(date + "T00:00:00").toLocaleDateString(
                            "id-ID",
                            {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            }
                          )}
                        </h3>
                        <div className="flex items-center gap-3">
                          {dayPenjualan > 0 && (
                            <span className="text-base font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              +{rupiah(dayPenjualan)}
                            </span>
                          )}
                          {dayPembelian > 0 && (
                            <span className="text-base font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                              -{rupiah(dayPembelian)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {orders.map((o) => (
                          <div
                            key={o.id}
                            className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-base font-bold ${
                                    o.order_type === "penjualan"
                                      ? "bg-emerald-50 text-emerald-600"
                                      : "bg-red-50 text-red-500"
                                  }`}
                                >
                                  {o.order_type === "penjualan" ? "Jual" : "Beli"}
                                </span>
                                <span className="text-base font-semibold text-gray-700">
                                  {o.contact_name}
                                </span>
                              </div>
                              <span className="text-base font-bold text-gray-800">
                                {rupiah(o.total)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-base text-gray-400 mb-1">
                              <span>{o.items.map((i) => `${i.product_name} x${i.quantity}`).join(", ")}</span>
                              <span className="uppercase text-xs font-semibold">{o.payment_type}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
