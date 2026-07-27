import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  ChevronDown,
  ChevronUp,
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
  items: { product_name: string; quantity: number; price: number; discount: number; cost_price: number }[];
}

interface ItemProfit {
  product_name: string;
  total_qty: number;
  total_jual: number;
  total_modal: number;
  total_laba: number;
}

function rupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function SalesDashboard() {
  const [tab, setTab] = useState<TabFilter>("all");
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [showLabaDetail, setShowLabaDetail] = useState(true);
  const [chartMode, setChartMode] = useState<"daily" | "monthly">("daily");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [ordersRes, productsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, status, total, paid_total, order_type, payment_type, ongkir, notes, created_at, customer_id")
        .neq("status", "deleted")
        .order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("name, cost_price"),
    ]);

    const orders = ordersRes.data;
    if (!orders || orders.length === 0) {
      setAllOrders([]);
      setLoading(false);
      return;
    }

    const costMap: Record<string, number> = {};
    if (productsRes.data) {
      for (const p of productsRes.data) {
        costMap[p.name] = p.cost_price || 0;
      }
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
          cost_price: costMap[item.product_name] || 0,
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

  const dailyStats = Object.entries(groupedByDate).map(([date, orders]) => ({
    date,
    penjualan: orders.filter((o) => o.order_type === "penjualan").reduce((s, o) => s + o.total, 0),
    pembelian: orders.filter((o) => o.order_type === "pembelian").reduce((s, o) => s + o.total, 0),
  }));

  const groupedByMonth: Record<string, { penjualan: number; pembelian: number }> = {};
  for (const o of filtered) {
    const month = o.date.substring(0, 7);
    if (!groupedByMonth[month]) groupedByMonth[month] = { penjualan: 0, pembelian: 0 };
    if (o.order_type === "penjualan") groupedByMonth[month].penjualan += o.total;
    else groupedByMonth[month].pembelian += o.total;
  }
  const monthlyStats = Object.entries(groupedByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  const chartData = chartMode === "daily" ? dailyStats : monthlyStats;
  const chartKey = chartMode === "daily" ? "date" : "month";
  const maxChart = Math.max(1, ...chartData.map((d) => Math.max(d.penjualan, d.pembelian)));

  const itemProfitMap: Record<string, ItemProfit> = {};
  for (const o of filtered) {
    for (const item of o.items) {
      if (!itemProfitMap[item.product_name]) {
        itemProfitMap[item.product_name] = {
          product_name: item.product_name,
          total_qty: 0,
          total_jual: 0,
          total_modal: 0,
          total_laba: 0,
        };
      }
      const entry = itemProfitMap[item.product_name];
      entry.total_qty += item.quantity;
      entry.total_jual += (item.price * item.quantity) - item.discount;
      entry.total_modal += item.cost_price * item.quantity;
    }
  }
  for (const key of Object.keys(itemProfitMap)) {
    itemProfitMap[key].total_laba = itemProfitMap[key].total_jual - itemProfitMap[key].total_modal;
  }
  const itemProfits = Object.values(itemProfitMap).sort((a, b) => b.total_laba - a.total_laba);

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

            {dailyStats.length > 0 && (
              <div className="bg-gradient-to-br from-white via-pink-50/30 to-white border border-pink-100/60 rounded-2xl p-5 shadow-md shadow-pink-100/40 mb-5">
                <button
                  onClick={() => setShowChart(!showChart)}
                  className="flex items-center justify-between w-full"
                >
                  <h3 className="text-lg font-bold text-gray-800">Grafik</h3>
                  {showChart ? <ChevronUp className="w-5 h-5 text-pink-400" /> : <ChevronDown className="w-5 h-5 text-pink-400" />}
                </button>
                {showChart && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-4">
                      <button
                        onClick={() => setChartMode("daily")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          chartMode === "daily"
                            ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/40"
                            : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
                        }`}
                      >
                        Harian
                      </button>
                      <button
                        onClick={() => setChartMode("monthly")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          chartMode === "monthly"
                            ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/40"
                            : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
                        }`}
                      >
                        Bulanan
                      </button>
                      <div className="flex-1" />
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-500 shadow-sm shadow-emerald-200" />
                          <span className="text-xs text-gray-500 font-semibold">Jual</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-gradient-to-b from-rose-400 to-rose-500 shadow-sm shadow-rose-200" />
                          <span className="text-xs text-gray-500 font-semibold">Beli</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-end gap-1" style={{ height: 200 }}>
                      {chartData.map((d, idx) => {
                        const key = (d as any)[chartKey];
                        const label = chartMode === "daily"
                          ? new Date(key + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                          : new Date(key + "-01T00:00:00").toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
                        const total = d.penjualan + d.pembelian;
                        const showLabel = total > 0;
                        return (
                          <div key={key} className="flex-1 flex flex-col items-center min-w-0 group">
                            {showLabel && (
                              <div className="text-[9px] font-bold text-gray-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                {d.penjualan > 0 && <span className="text-emerald-500">{rupiah(d.penjualan)}</span>}
                                {d.penjualan > 0 && d.pembelian > 0 && <span className="text-gray-300"> / </span>}
                                {d.pembelian > 0 && <span className="text-rose-400">{rupiah(d.pembelian)}</span>}
                              </div>
                            )}
                            <div className="flex items-end gap-[3px] w-full" style={{ height: 170 }}>
                              <div
                                className="flex-1 rounded-t-lg transition-all duration-300 group-hover:opacity-90"
                                style={{
                                  height: `${(d.penjualan / maxChart) * 100}%`,
                                  minHeight: d.penjualan > 0 ? 6 : 0,
                                  background: "linear-gradient(180deg, #34d399 0%, #10b981 100%)",
                                  boxShadow: d.penjualan > 0 ? "0 -2px 8px rgba(16,185,129,0.25)" : "none",
                                }}
                              />
                              <div
                                className="flex-1 rounded-t-lg transition-all duration-300 group-hover:opacity-90"
                                style={{
                                  height: `${(d.pembelian / maxChart) * 100}%`,
                                  minHeight: d.pembelian > 0 ? 6 : 0,
                                  background: "linear-gradient(180deg, #fb7185 0%, #f43f5e 100%)",
                                  boxShadow: d.pembelian > 0 ? "0 -2px 8px rgba(244,63,94,0.25)" : "none",
                                }}
                              />
                            </div>
                            <p className="text-[10px] text-gray-400 font-semibold truncate w-full text-center mt-1.5">
                              {label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {itemProfits.length > 0 && (
              <div className="bg-gradient-to-br from-white via-pink-50/30 to-white border border-pink-100/60 rounded-2xl p-5 shadow-md shadow-pink-100/40 mb-5">
                <button
                  onClick={() => setShowLabaDetail(!showLabaDetail)}
                  className="flex items-center justify-between w-full"
                >
                  <h3 className="text-lg font-bold text-gray-800">Rincian Laba per Item</h3>
                  {showLabaDetail ? <ChevronUp className="w-5 h-5 text-pink-400" /> : <ChevronDown className="w-5 h-5 text-pink-400" />}
                </button>
                {showLabaDetail && (
                  <div className="mt-4 space-y-2.5">
                    {itemProfits.map((ip) => {
                      const maxJual = Math.max(...itemProfits.map((x) => x.total_jual), 1);
                      const pct = (ip.total_jual / maxJual) * 100;
                      return (
                        <div
                          key={ip.product_name}
                          className="bg-white/60 border border-pink-50 rounded-xl p-3.5 hover:shadow-md hover:shadow-pink-50 transition-all"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-base font-bold text-gray-800 truncate">{ip.product_name}</p>
                            <span
                              className={`text-base font-bold ml-3 ${
                                ip.total_laba >= 0 ? "text-emerald-600" : "text-red-500"
                              }`}
                            >
                              {ip.total_laba >= 0 ? "+" : ""}{rupiah(ip.total_laba)}
                            </span>
                          </div>
                          <div className="h-2 bg-pink-50 rounded-full overflow-hidden mb-2">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background: ip.total_laba >= 0
                                  ? "linear-gradient(90deg, #34d399, #10b981)"
                                  : "linear-gradient(90deg, #fb7185, #f43f5e)",
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400 font-semibold">
                            <span>{ip.total_qty} terjual</span>
                            <span className="text-pink-200">·</span>
                            <span>Jual {rupiah(ip.total_jual)}</span>
                            <span className="text-pink-200">·</span>
                            <span>Modal {rupiah(ip.total_modal)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-3 mt-1 border-t border-pink-100">
                      <p className="text-lg font-bold text-gray-800">Total Laba</p>
                      <span
                        className={`text-lg font-bold ${
                          laba >= 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {rupiah(laba)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

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
