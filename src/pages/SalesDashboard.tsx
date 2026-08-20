import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package,
  ChevronDown, ChevronUp, Download, AlertTriangle, Trophy, Receipt
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
  status: string;
  items: { product_name: string; quantity: number; price: number; discount: number; cost_price: number }[];
}

interface ItemProfit {
  product_name: string;
  total_qty: number;
  total_jual: number;
  total_modal: number;
  total_laba: number;
}

interface PiutangRow {
  customer_name: string;
  order_id: string;
  total: number;
  paid: number;
  sisa: number;
  date: string;
  items: string;
}

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  stock: number;
}

interface StokAlert {
  name: string;
  stock: number;
  avgPerDay: number;
  daysLeft: number;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
}

function rupiah(n: number): string {
  if (Math.abs(n) >= 1000000) return "Rp " + (n / 1000000).toFixed(1).replace(".0", "") + "jt";
  if (Math.abs(n) >= 1000) return "Rp " + (n / 1000).toFixed(0) + "rb";
  return "Rp " + n.toLocaleString("id-ID");
}

function rupiahFull(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function SalesDashboard() {
  const [tab, setTab] = useState<TabFilter>("all");
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [showLabaDetail, setShowLabaDetail] = useState(true);
  const [showPiutang, setShowPiutang] = useState(true);
  const [showTopProduk, setShowTopProduk] = useState(true);
  const [showStokAlert, setShowStokAlert] = useState(true);
  const [chartMode, setChartMode] = useState<"daily" | "monthly">("daily");
  const [products, setProducts] = useState<{ name: string; stock: number; cost_price: number; sell_price: number }[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [showRefund, setShowRefund] = useState(false);
  const [refundList, setRefundList] = useState<{ id: string; order_id: string; amount: number; reason: string; created_at: string; customer_name: string }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [ordersRes, productsRes, expensesRes, refundsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, status, total, paid_total, order_type, payment_type, ongkir, notes, created_at, customer_id")
        .neq("status", "deleted")
        .order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("name, cost_price, sell_price, stock"),
      supabase
        .from("expenses")
        .select("id, category, description, amount, expense_date"),
      supabase
        .from("refunds")
        .select("id, order_id, amount, reason, created_at")
        .order("created_at", { ascending: false }),
    ]);

    const orders = ordersRes.data;
    if (!orders || orders.length === 0) {
      setAllOrders([]);
      setLoading(false);
      return;
    }

    if (productsRes.data) {
      setProducts(productsRes.data);
    }

    if (expensesRes.data) {
      setExpenses(expensesRes.data);
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
      status: o.status,
      items: itemsByOrder[o.id] || [],
    }));

    setAllOrders(rows);

    if (refundsRes.data && refundsRes.data.length > 0) {
      const refundOrderIds = [...new Set(refundsRes.data.map((r) => r.order_id))];
      const { data: refundOrders } = await supabase
        .from("orders").select("id, customer_id").in("id", refundOrderIds);
      const refundCustomerMap: Record<string, string> = {};
      if (refundOrders) {
        for (const ro of refundOrders) {
          refundCustomerMap[ro.id] = customerMap[ro.customer_id] || "-";
        }
      }
      setRefundList(refundsRes.data.map((r) => ({
        ...r,
        customer_name: refundCustomerMap[r.order_id] || "-",
      })));
    }

    setLoading(false);
  }

  const filtered = allOrders.filter((o) => {
    if (tab === "all") return true;
    return o.order_type === tab;
  });

  const totalPenjualan = allOrders
    .filter((o) => o.order_type === "penjualan")
    .reduce((s, o) => s + o.total, 0) - refundList.reduce((s, r) => s + r.amount, 0);

  const totalPembelian = allOrders
    .filter((o) => o.order_type === "pembelian")
    .reduce((s, o) => s + o.total, 0);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalOngkir = expenses.filter((e) => e.category === "ongkir").reduce((s, e) => s + e.amount, 0);
  const totalKemasan = expenses.filter((e) => e.category === "kemasan").reduce((s, e) => s + e.amount, 0);

  const laba = totalPenjualan - totalPembelian - totalExpenses;

  const totalItemTerjual = allOrders
    .filter((o) => o.order_type === "penjualan")
    .reduce((s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0), 0);

  const totalProdukTerjual = new Set(
    allOrders
      .filter((o) => o.order_type === "penjualan")
      .flatMap((o) => o.items.map((i) => i.product_name))
  ).size;

  // Chart data
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

  // Item profits
  const itemProfitMap: Record<string, ItemProfit> = {};
  for (const o of allOrders.filter((o) => o.order_type === "penjualan")) {
    for (const item of o.items) {
      if (!itemProfitMap[item.product_name]) {
        itemProfitMap[item.product_name] = { product_name: item.product_name, total_qty: 0, total_jual: 0, total_modal: 0, total_laba: 0 };
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

  // Piutang
  const piutangList: PiutangRow[] = allOrders
    .filter((o) => o.order_type === "penjualan" && o.paid_total < o.total && o.fulfillment_status !== "cancelled")
    .map((o) => ({
      customer_name: o.contact_name,
      order_id: o.id,
      total: o.total,
      paid: o.paid_total,
      sisa: o.total - o.paid_total,
      date: o.date,
      items: o.items.map((i) => `${i.product_name} ×${i.quantity}`).join(", "),
    }))
    .sort((a, b) => b.sisa - a.sisa);

  const totalPiutang = piutangList.reduce((s, p) => s + p.sisa, 0);

  // Top produk
  const topProdukMap: Record<string, TopProduct> = {};
  for (const o of allOrders.filter((o) => o.order_type === "penjualan")) {
    for (const item of o.items) {
      if (!topProdukMap[item.product_name]) {
        const prod = products.find((p) => p.name === item.product_name);
        topProdukMap[item.product_name] = { name: item.product_name, qty: 0, revenue: 0, cost: 0, stock: prod?.stock || 0 };
      }
      topProdukMap[item.product_name].qty += item.quantity;
      topProdukMap[item.product_name].revenue += (item.price * item.quantity) - item.discount;
      topProdukMap[item.product_name].cost += item.cost_price * item.quantity;
    }
  }
  const topProduks = Object.values(topProdukMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const maxTopQty = Math.max(1, ...topProduks.map((p) => p.qty));

  // Stok alert
  const stokAlerts: StokAlert[] = products
    .filter((p) => p.stock <= 10)
    .map((p) => {
      const sold = topProdukMap[p.name]?.qty || 0;
      const avgPerDay = sold / 30;
      const daysLeft = avgPerDay > 0 ? Math.floor(p.stock / avgPerDay) : 999;
      return { name: p.name, stock: p.stock, avgPerDay, daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  function handleExportDetail() {
    if (!selectedProduct) {
      alert("Pilih produk dulu!");
      return;
    }
    const rows: string[][] = [
      ["Nama Pelanggan", "Harga", "Qty", "Total Harga"],
    ];
    for (const o of filtered) {
      for (const item of o.items) {
        if (item.product_name === selectedProduct) {
          const itemTotal = (item.price - item.discount) * item.quantity;
          rows.push([
            o.contact_name,
            rupiahFull(item.price - item.discount),
            String(item.quantity),
            rupiahFull(itemTotal),
          ]);
        }
      }
    }
    const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedProduct.replace(/\s+/g, "_")}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportAll() {
    const rows: string[][] = [
      ["Tanggal", "Tipe", "Pelanggan", "Produk", "Qty", "Harga", "Total", "Bayar", "Sisa", "Metode", "Status"],
    ];
    for (const o of filtered) {
      if (o.items.length === 0) {
        rows.push([
          o.date,
          o.order_type === "penjualan" ? "Penjualan" : "Pembelian",
          o.contact_name,
          "-",
          "0",
          "0",
          rupiahFull(o.total),
          rupiahFull(o.paid_total),
          rupiahFull(o.total - o.paid_total),
          o.payment_type.toUpperCase(),
          o.status,
        ]);
      } else {
        for (const item of o.items) {
          const itemTotal = (item.price - item.discount) * item.quantity;
          rows.push([
            o.date,
            o.order_type === "penjualan" ? "Penjualan" : "Pembelian",
            o.contact_name,
            item.product_name,
            String(item.quantity),
            rupiahFull(item.price - item.discount),
            rupiahFull(itemTotal),
            "",
            "",
            o.payment_type.toUpperCase(),
            o.status,
          ]);
        }
      }
    }
    const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-semua-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <main className="px-4 py-4 relative z-10 flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-xl font-extrabold text-slate-800">Laporan</h1>
                <button
                  onClick={handleExportAll}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Excel
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-bold border border-pink-200 bg-pink-50 text-pink-600"
                >
                  <option value="">Pilih Produk</option>
                  {products.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleExportDetail}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-pink-200 bg-pink-50 text-pink-600 hover:bg-pink-100 transition-all shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-white border border-slate-100 rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Penjualan</p>
                <p className="text-lg font-extrabold text-emerald-600">{rupiah(totalPenjualan)}</p>
                <p className="text-[10px] text-slate-400">{allOrders.filter((o) => o.order_type === "penjualan").length} transaksi</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-2">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Pembelian</p>
                <p className="text-lg font-extrabold text-red-500">{rupiah(totalPembelian)}</p>
                <p className="text-[10px] text-slate-400">{allOrders.filter((o) => o.order_type === "pembelian").length} transaksi</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center mb-2">
                  <Receipt className="w-4 h-4 text-rose-500" />
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Biaya Operasional</p>
                <p className="text-lg font-extrabold text-rose-500">{rupiah(totalExpenses)}</p>
                <p className="text-[10px] text-slate-400">Ongkir {rupiah(totalOngkir)} · Kemasan {rupiah(totalKemasan)}</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center mb-2">
                  <DollarSign className="w-4 h-4 text-pink-500" />
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Laba Bersih</p>
                <p className={`text-lg font-extrabold ${laba >= 0 ? "text-emerald-600" : "text-red-500"}`}>{rupiah(laba)}</p>
                <p className="text-[10px] text-slate-400">Jual - Beli - Biaya</p>
              </div>
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl p-4 mb-4">
                <button onClick={() => setShowChart(!showChart)} className="flex items-center justify-between w-full">
                  <h3 className="text-sm font-bold text-slate-800">Grafik</h3>
                  {showChart ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showChart && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex gap-1">
                        <button onClick={() => setChartMode("daily")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${chartMode === "daily" ? "bg-pink-500 text-white" : "bg-slate-100 text-slate-500"}`}>Harian</button>
                        <button onClick={() => setChartMode("monthly")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${chartMode === "monthly" ? "bg-pink-500 text-white" : "bg-slate-100 text-slate-500"}`}>Bulanan</button>
                      </div>
                      <div className="flex-1" />
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[10px] text-slate-500 font-semibold">Jual</span></div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-400" /><span className="text-[10px] text-slate-500 font-semibold">Beli</span></div>
                      </div>
                    </div>
                    <div className="flex items-end gap-1" style={{ height: 140 }}>
                      {chartData.map((d) => {
                        const key = (d as any)[chartKey];
                        const label = chartMode === "daily"
                          ? new Date(key + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                          : new Date(key + "-01T00:00:00").toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
                        return (
                          <div key={key} className="flex-1 flex flex-col items-center min-w-0">
                            <div className="flex items-end gap-[2px] w-full" style={{ height: 120 }}>
                              <div className="flex-1 rounded-t" style={{ height: `${(d.penjualan / maxChart) * 100}%`, minHeight: d.penjualan > 0 ? 4 : 0, background: "linear-gradient(180deg, #34d399, #10b981)" }} />
                              <div className="flex-1 rounded-t" style={{ height: `${(d.pembelian / maxChart) * 100}%`, minHeight: d.pembelian > 0 ? 4 : 0, background: "linear-gradient(180deg, #fb7185, #ef4444)" }} />
                            </div>
                            <p className="text-[8px] text-slate-400 font-semibold truncate w-full text-center mt-1">{label}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Piutang */}
            {piutangList.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl p-4 mb-4">
                <button onClick={() => setShowPiutang(!showPiutang)} className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">Piutang</h3>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">{piutangList.length} order</span>
                  </div>
                  {showPiutang ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showPiutang && (
                  <div className="mt-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex justify-between items-center">
                      <span className="text-xs font-semibold text-amber-700">Total Piutang</span>
                      <span className="text-base font-extrabold text-amber-600">{rupiahFull(totalPiutang)}</span>
                    </div>
                    <div className="space-y-2">
                      {piutangList.slice(0, 5).map((p) => (
                        <div key={p.order_id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                          <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center text-sm font-bold text-pink-500 flex-shrink-0">
                            {p.customer_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{p.customer_name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{p.items}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-extrabold text-amber-600">{rupiahFull(p.sisa)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {refundList.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl p-4 mb-4">
                <button onClick={() => setShowRefund(!showRefund)} className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">Refund</h3>
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">{refundList.length} refund</span>
                  </div>
                  {showRefund ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showRefund && (
                  <div className="mt-3">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 flex justify-between items-center">
                      <span className="text-xs font-semibold text-red-700">Total Refund</span>
                      <span className="text-base font-extrabold text-red-600">-{rupiahFull(refundList.reduce((s, r) => s + r.amount, 0))}</span>
                    </div>
                    <div className="space-y-2">
                      {refundList.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-sm font-bold text-red-500 flex-shrink-0">
                            {r.customer_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{r.customer_name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{r.reason || "Tanpa alasan"} &middot; {new Date(r.created_at).toLocaleDateString("id-ID")}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-extrabold text-red-600">-{rupiahFull(r.amount)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Top Produk */}
            {topProduks.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl p-4 mb-4">
                <button onClick={() => setShowTopProduk(!showTopProduk)} className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">Produk Terlaris</h3>
                  </div>
                  {showTopProduk ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showTopProduk && (
                  <div className="mt-3 space-y-2">
                    {topProduks.map((tp, idx) => (
                      <div key={tp.name} className="flex items-center gap-3 py-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                          idx === 0 ? "bg-amber-100 text-amber-600" : idx === 1 ? "bg-slate-100 text-slate-500" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-slate-50 text-slate-400"
                        }`}>{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{tp.name}</p>
                          <div className="h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-pink-400 to-pink-500 rounded-full" style={{ width: `${(tp.qty / maxTopQty) * 100}%` }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-extrabold text-pink-500">{tp.qty} terjual</p>
                          <p className="text-[10px] text-slate-400">{rupiah(tp.revenue)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Stok Alert */}
            {stokAlerts.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl p-4 mb-4">
                <button onClick={() => setShowStokAlert(!showStokAlert)} className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">Stok Rendah</h3>
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded">{stokAlerts.length} produk</span>
                  </div>
                  {showStokAlert ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showStokAlert && (
                  <div className="mt-3 space-y-2">
                    {stokAlerts.map((sa) => (
                      <div key={sa.name} className="flex items-center gap-3 py-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${sa.stock === 0 ? "bg-red-100" : "bg-amber-100"}`}>
                          <AlertTriangle className={`w-4 h-4 ${sa.stock === 0 ? "text-red-500" : "text-amber-500"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{sa.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {sa.stock === 0 ? "Stok habis" : `Stok habis dalam ${sa.daysLeft} hari`}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${sa.stock === 0 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
                          Stok {sa.stock}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
              {([
                ["all", "Semua"],
                ["penjualan", "Penjualan"],
                ["pembelian", "Pembelian"],
              ] as [TabFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                    tab === key
                      ? "bg-pink-500 text-white border-pink-500"
                      : "bg-white text-slate-500 border-slate-200"
                  }`}
                >
                  {label} ({key === "all" ? allOrders.length : allOrders.filter((o) => o.order_type === key).length})
                </button>
              ))}
            </div>

            {/* Transactions */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 bg-pink-50 border border-pink-100 rounded-2xl flex items-center justify-center mb-4">
                  <DollarSign className="w-7 h-7 text-pink-300" />
                </div>
                <p className="text-slate-500 font-semibold">Belum ada data</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedByDate).map(([date, orders]) => {
                  const dayPenjualan = orders.filter((o) => o.order_type === "penjualan").reduce((s, o) => s + o.total, 0);
                  const dayPembelian = orders.filter((o) => o.order_type === "pembelian").reduce((s, o) => s + o.total, 0);
                  return (
                    <div key={date}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-slate-500">
                          {new Date(date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </h3>
                        <div className="flex gap-1.5">
                          {dayPenjualan > 0 && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-600">+{rupiah(dayPenjualan)}</span>}
                          {dayPembelian > 0 && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-500">-{rupiah(dayPembelian)}</span>}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {orders.map((o) => (
                          <div key={o.id} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${o.order_type === "penjualan" ? "bg-emerald-50" : "bg-red-50"}`}>
                              {o.order_type === "penjualan" ? <ShoppingCart className="w-4 h-4 text-emerald-500" /> : <Package className="w-4 h-4 text-red-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">{o.contact_name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{o.items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`text-sm font-extrabold ${o.order_type === "penjualan" ? "text-emerald-600" : "text-red-500"}`}>
                                {o.order_type === "penjualan" ? "+" : "-"}{rupiahFull(o.total)}
                              </p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">{o.payment_type}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Laba Detail */}
            {itemProfits.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-xl p-4 mt-4">
                <button onClick={() => setShowLabaDetail(!showLabaDetail)} className="flex items-center justify-between w-full">
                  <h3 className="text-sm font-bold text-slate-800">Rincian Laba per Item</h3>
                  {showLabaDetail ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showLabaDetail && (
                  <div className="mt-3 space-y-2">
                    {itemProfits.map((ip) => {
                      const maxJual = Math.max(...itemProfits.map((x) => x.total_jual), 1);
                      const pct = (ip.total_jual / maxJual) * 100;
                      return (
                        <div key={ip.product_name} className="py-2 border-b border-slate-50 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-bold text-slate-800 truncate">{ip.product_name}</p>
                            <span className={`text-sm font-extrabold ml-2 ${ip.total_laba >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {ip.total_laba >= 0 ? "+" : ""}{rupiah(ip.total_laba)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ip.total_laba >= 0 ? "linear-gradient(90deg, #34d399, #10b981)" : "linear-gradient(90deg, #fb7185, #ef4444)" }} />
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-semibold">
                            <span>{ip.total_qty} terjual</span>
                            <span>·</span>
                            <span>Jual {rupiah(ip.total_jual)}</span>
                            <span>·</span>
                            <span>Modal {rupiah(ip.total_modal)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <p className="text-sm font-bold text-slate-800">Total Laba</p>
                      <span className={`text-base font-extrabold ${laba >= 0 ? "text-emerald-600" : "text-red-500"}`}>{rupiahFull(laba)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
