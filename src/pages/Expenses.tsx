import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  ArrowLeft,
  Plus,
  Truck,
  Package,
  Trash2,
  Calendar,
  TrendingDown,
} from "lucide-react";

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Truck; color: string; bg: string }> = {
  ongkir: { label: "Ongkir", icon: Truck, color: "text-blue-600", bg: "bg-blue-50" },
  kemasan: { label: "Kemasan", icon: Package, color: "text-amber-600", bg: "bg-amber-50" },
};

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function Expenses() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formCategory, setFormCategory] = useState("ongkir");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  async function loadExpenses() {
    setLoading(true);
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false });
    setExpenses(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadExpenses();
  }, []);

  async function addExpense() {
    if (!formAmount || Number(formAmount) <= 0) return;
    await supabase.from("expenses").insert({
      category: formCategory,
      description: formDescription || null,
      amount: Number(formAmount),
      expense_date: formDate,
    });
    setShowForm(false);
    setFormDescription("");
    setFormAmount("");
    setFormDate(new Date().toISOString().split("T")[0]);
    loadExpenses();
  }

  async function deleteExpense(id: string) {
    await supabase.from("expenses").delete().eq("id", id);
    loadExpenses();
  }

  const filtered = expenses.filter((e) => e.expense_date?.startsWith(filterMonth));
  const totalOngkir = filtered.filter((e) => e.category === "ongkir").reduce((s, e) => s + e.amount, 0);
  const totalKemasan = filtered.filter((e) => e.category === "kemasan").reduce((s, e) => s + e.amount, 0);
  const totalAll = totalOngkir + totalKemasan;

  return (
    <div className="h-full flex flex-col relative z-10">
      <main className="flex-1 px-4 py-4 max-w-7xl w-full mx-auto overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/accounts")}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-800">Biaya Operasional</h1>
            <p className="text-sm text-slate-400">Track ongkir dan kemasan</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="w-10 h-10 rounded-xl bg-pink-500 text-white flex items-center justify-center shrink-0 shadow-sm"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Month Filter */}
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-pink-300"
          />
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
            <Truck className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <div className="text-lg font-extrabold text-blue-600">{rupiah(totalOngkir)}</div>
            <div className="text-xs text-blue-400 font-medium">Ongkir</div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
            <Package className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <div className="text-lg font-extrabold text-amber-600">{rupiah(totalKemasan)}</div>
            <div className="text-xs text-amber-400 font-medium">Kemasan</div>
          </div>
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-center">
            <TrendingDown className="w-5 h-5 text-rose-500 mx-auto mb-1" />
            <div className="text-lg font-extrabold text-rose-600">{rupiah(totalAll)}</div>
            <div className="text-xs text-rose-400 font-medium">Total</div>
          </div>
        </div>

        {/* Add Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">Tambah Biaya</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              {/* Category */}
              <div className="flex gap-2">
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setFormCategory(key)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
                      formCategory === key
                        ? `${cfg.bg} ${cfg.color} border-current`
                        : "bg-white text-slate-500 border-slate-200"
                    }`}
                  >
                    <cfg.icon className="w-4 h-4" />
                    {cfg.label}
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Nominal</label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Keterangan (opsional)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Contoh: Ongkir J&T ke Bandung"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Tanggal</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>

              {/* Submit */}
              <button
                onClick={addExpense}
                disabled={!formAmount || Number(formAmount) <= 0}
                className="w-full py-3 bg-pink-500 text-white font-bold rounded-xl hover:bg-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Simpan
              </button>
            </div>
          </div>
        )}

        {/* Expense List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <TrendingDown className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-500 font-semibold">Belum ada biaya</p>
            <p className="text-slate-300 text-sm mt-1">Tap + untuk tambah biaya</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((expense) => {
              const cfg = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.ongkir;
              return (
                <div
                  key={expense.id}
                  className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-3"
                >
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                    <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{cfg.label}</span>
                      {expense.description && (
                        <span className="text-xs text-slate-400 truncate">— {expense.description}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {new Date(expense.expense_date).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800">{rupiah(expense.amount)}</p>
                  </div>
                  <button
                    onClick={() => deleteExpense(expense.id)}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
