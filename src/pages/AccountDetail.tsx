import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";

function rupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accounts, accountTransactions, loadAccounts, loadAccountTransactions } = useStore();
  const [loading, setLoading] = useState(true);

  const account = accounts.find((a) => a.id === id);

  useEffect(() => {
    if (id) {
      Promise.all([loadAccounts(), loadAccountTransactions(id)]).then(() => setLoading(false));
    }
  }, [id]);

  const groupedByDate: Record<string, typeof accountTransactions> = {};
  for (const tx of accountTransactions) {
    if (!groupedByDate[tx.date]) groupedByDate[tx.date] = [];
    groupedByDate[tx.date].push(tx);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <main className="px-5 py-4 relative z-10 flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !account ? (
          <div className="flex flex-col items-center justify-center py-24">
            <p className="text-gray-500">Akun tidak ditemukan</p>
          </div>
        ) : (
          <>
            <button
              onClick={() => navigate("/accounts")}
              className="flex items-center gap-2 mb-4 text-pink-500 font-semibold text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </button>

            <div className={`rounded-2xl p-5 mb-5 shadow-lg ${
              account.type === "cash"
                ? "bg-gradient-to-br from-emerald-400 to-emerald-500 shadow-emerald-200/40"
                : "bg-gradient-to-br from-blue-400 to-blue-500 shadow-blue-200/40"
            }`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{account.icon}</span>
                <div>
                  <p className="text-white/80 text-sm font-semibold">{account.type === "cash" ? "Kas Tunai" : "Bank"}{account.account_number ? ` · ${account.account_number}` : ""}</p>
                  <p className="text-white text-xl font-bold">{account.name}</p>
                </div>
              </div>
              <p className="text-white/80 text-xs font-semibold mb-0.5">Saldo Saat Ini</p>
              <p className={`text-2xl font-bold ${account.balance >= 0 ? "text-white" : "text-red-200"}`}>
                {rupiah(account.balance)}
              </p>
            </div>

            {Object.entries(groupedByDate).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-gray-400 text-sm">Belum ada transaksi</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedByDate)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, txs]) => {
                    const dayTotal = txs.reduce((s, tx) => s + tx.amount, 0);
                    return (
                      <div key={date}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-gray-600">
                            {new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </h4>
                          <span className={`text-sm font-bold ${dayTotal >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {dayTotal >= 0 ? "+" : ""}{rupiah(dayTotal)}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {txs.map((tx) => (
                            <div
                              key={tx.id}
                              className="bg-white/80 border border-pink-100/60 rounded-xl p-3.5 flex items-center justify-between shadow-sm shadow-pink-50"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                                  tx.amount >= 0 ? "bg-emerald-50 border border-emerald-100" : "bg-red-50 border border-red-100"
                                }`}>
                                  {tx.amount >= 0 ? (
                                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                                  ) : (
                                    <TrendingDown className="w-4 h-4 text-red-500" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">{tx.description}</p>
                                  <p className="text-xs text-gray-400">{tx.contact_name || "-"} · {tx.order_type ? (tx.order_type === "penjualan" ? "Penjualan" : "Pembelian") : "Manual"}</p>
                                </div>
                              </div>
                              <span className={`text-sm font-bold ${tx.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {tx.amount >= 0 ? "+" : ""}{rupiah(tx.amount)}
                              </span>
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
