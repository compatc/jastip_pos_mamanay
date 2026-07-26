import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
} from "lucide-react";

type TabFilter = "all" | "penjualan" | "pembelian";

interface MovementRow {
  id: string;
  product_name: string;
  date: string;
  transaction_type: string;
  invoice_no: number;
  party_name: string;
  qty: number;
  qty_after: number;
  unit: string;
  amount: number;
}

function rupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function SalesDashboard() {
  const { loadProducts, loadStockMovements } = useStore();
  const [tab, setTab] = useState<TabFilter>("all");
  const [allMovements, setAllMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    await loadProducts();

    const allProducts = useStore.getState().products;
    const priceMap: Record<string, { cost: number; sell: number }> = {};
    for (const p of allProducts) {
      priceMap[p.name] = { cost: p.cost_price, sell: p.sell_price };
    }

    const rows: MovementRow[] = [];
    for (const p of allProducts) {
      await loadStockMovements(p.id);
      const movements = useStore.getState().stockMovements;
      for (const m of movements) {
        const prices = priceMap[p.name];
        let amount = 0;
        if (prices) {
          amount = m.transaction_type === "Penjualan"
            ? Math.abs(m.qty) * prices.sell
            : Math.abs(m.qty) * prices.cost;
        }
        rows.push({
          id: m.id,
          product_name: p.name,
          date: m.date,
          transaction_type: m.transaction_type,
          invoice_no: m.invoice_no,
          party_name: m.party_name,
          qty: m.qty,
          qty_after: m.qty_after,
          unit: m.unit,
          amount,
        });
      }
    }

    rows.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return b.invoice_no - a.invoice_no;
    });

    setAllMovements(rows);
    setLoading(false);
  }

  const filtered = allMovements.filter((m) => {
    if (tab === "all") return true;
    return m.transaction_type.toLowerCase() === tab;
  });

  const totalPenjualan = allMovements
    .filter((m) => m.transaction_type === "Penjualan")
    .reduce((s, m) => s + m.amount, 0);

  const totalPembelian = allMovements
    .filter((m) => m.transaction_type === "Pembelian")
    .reduce((s, m) => s + m.amount, 0);

  const laba = totalPenjualan - totalPembelian;

  const groupedByDate: Record<string, MovementRow[]> = {};
  for (const m of filtered) {
    const d = m.date;
    if (!groupedByDate[d]) groupedByDate[d] = [];
    groupedByDate[d].push(m);
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
                Semua ({allMovements.length})
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
                Penjualan ({allMovements.filter((m) => m.transaction_type === "Penjualan").length})
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
                Pembelian ({allMovements.filter((m) => m.transaction_type === "Pembelian").length})
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
                {Object.entries(groupedByDate).map(([date, items]) => {
                  const dayPenjualan = items
                    .filter((m) => m.transaction_type === "Penjualan")
                    .reduce((s, m) => s + m.amount, 0);
                  const dayPembelian = items
                    .filter((m) => m.transaction_type === "Pembelian")
                    .reduce((s, m) => s + m.amount, 0);
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
                        {items.map((m) => (
                          <div
                            key={m.id}
                            className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-base font-bold ${
                                    m.transaction_type === "Penjualan"
                                      ? "bg-emerald-50 text-emerald-600"
                                      : "bg-red-50 text-red-500"
                                  }`}
                                >
                                  {m.transaction_type === "Penjualan"
                                    ? "Jual"
                                    : "Beli"}
                                </span>
                                <span className="text-base font-semibold text-gray-700">
                                  {m.product_name}
                                </span>
                              </div>
                              <span className="text-base font-bold text-gray-800">
                                {rupiah(m.amount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-base text-gray-400">
                              <span>
                                {m.party_name} · No. {m.invoice_no}
                              </span>
                              <span>
                                {Math.abs(m.qty)} {m.unit}
                              </span>
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
