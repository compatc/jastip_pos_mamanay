import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { Plus, Trash2, Wallet, Landmark } from "lucide-react";

function rupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function Accounts() {
  const { accounts, loadAccounts, addAccount, deleteAccount } = useStore();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"cash" | "bank">("cash");
  const [accountNumber, setAccountNumber] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function handleAdd() {
    if (!name.trim()) return;
    const icon = type === "cash" ? "💵" : "🏦";
    try {
      await addAccount(name.trim(), type, icon, accountNumber.trim());
      setName("");
      setAccountNumber("");
      setShowForm(false);
    } catch (err: any) {
      alert("Gagal simpan akun: " + (err.message || err));
    }
  }

  const totalSaldo = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <main className="px-5 py-4 relative z-10 flex-1 overflow-y-auto pb-6">
        <div className="bg-gradient-to-br from-pink-400 to-rose-500 rounded-2xl p-5 mb-5 shadow-lg shadow-pink-200/40">
          <p className="text-pink-100 text-sm font-semibold mb-1">Total Saldo</p>
          <p className="text-2xl font-bold text-white">{rupiah(totalSaldo)}</p>
          <div className="flex gap-3 mt-3">
            {accounts.map((a) => (
              <div key={a.id} className="bg-white/20 rounded-xl px-3 py-2 flex-1">
                <p className="text-xs text-pink-100 font-semibold">{a.icon} {a.name}</p>
                <p className="text-sm font-bold text-white mt-0.5">{rupiah(a.balance)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Daftar Akun</h3>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-pink-400 to-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-pink-200/30"
          >
            <Plus className="w-3.5 h-3.5" />
            Akun
          </button>
        </div>

        <div className="space-y-3">
          {accounts.map((a) => (
            <div
              key={a.id}
              onClick={() => navigate(`/accounts/${a.id}`)}
              className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm shadow-pink-50 cursor-pointer hover:shadow-md hover:shadow-pink-100/40 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                    a.type === "cash" ? "bg-emerald-50 border border-emerald-100" : "bg-blue-50 border border-blue-100"
                  }`}>
                    {a.icon}
                  </div>
                  <div>
                    <p className="text-base font-bold text-gray-800">{a.name}</p>
                    <p className="text-xs text-gray-400 font-semibold">{a.type === "cash" ? "Kas Tunai" : "Bank"}{a.account_number ? ` · ${a.account_number}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className={`text-lg font-bold ${a.balance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {rupiah(a.balance)}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(a.id); }}
                    className="p-2 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {accounts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-4">
                <Wallet className="w-8 h-8 text-pink-300" />
              </div>
              <p className="text-gray-500 font-medium">Belum ada akun</p>
              <p className="text-gray-400 text-sm">Buat akun kas atau bank untuk mulai</p>
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-center justify-center p-4">
            <div className="bg-white border border-pink-100 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-pink-100/50">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Tambah Akun</h3>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama akun (contoh: Bank BCA)"
                className="w-full border border-pink-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 mb-3"
              />
              {type === "bank" && (
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Nomor rekening (opsional)"
                  className="w-full border border-pink-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 mb-3"
                />
              )}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setType("cash")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    type === "cash"
                      ? "bg-pink-500 text-white border-pink-500"
                      : "bg-pink-50 text-gray-400 border-pink-100 hover:bg-pink-100"
                  }`}
                >
                  <span>💵</span> Kas Tunai
                </button>
                <button
                  onClick={() => setType("bank")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    type === "bank"
                      ? "bg-pink-500 text-white border-pink-500"
                      : "bg-pink-50 text-gray-400 border-pink-100 hover:bg-pink-100"
                  }`}
                >
                  <span>🏦</span> Bank
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-400 bg-gray-50 hover:bg-gray-100 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={handleAdd}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-pink-400 to-rose-500 shadow-md shadow-pink-200/30"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-center justify-center p-4">
            <div className="bg-white border border-pink-100 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-pink-100/50">
              <h3 className="text-lg font-bold text-gray-800 mb-2">Hapus Akun?</h3>
              <p className="text-sm text-gray-400 mb-5">Semua riwayat transaksi di akun ini akan dihapus.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-400 bg-gray-50 hover:bg-gray-100 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={async () => {
                    await deleteAccount(deleteConfirm);
                    setDeleteConfirm(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-all"
                >
                  Hapus
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
