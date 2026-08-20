import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import type { CustomerCategory } from "../types";
import {
  UserPlus,
  Search,
  ShoppingBag,
  Truck,
  Pencil,
  Trash2,
  Download,
  Upload,
  MessageCircle,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

type TabFilter = "all" | "pelanggan" | "supplier";

const CUSTOMER_COLORS = [
  "from-pink-100 to-rose-100 border-pink-200/50 text-pink-600",
  "from-violet-100 to-purple-100 border-violet-200/50 text-violet-600",
  "from-emerald-100 to-teal-100 border-emerald-200/50 text-emerald-600",
  "from-sky-100 to-blue-100 border-sky-200/50 text-sky-600",
  "from-amber-100 to-orange-100 border-amber-200/50 text-amber-600",
];

function getCustomerColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CUSTOMER_COLORS[Math.abs(hash) % CUSTOMER_COLORS.length];
}

export default function Dashboard() {
  const {
    customers,
    loadCustomers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
  } = useStore();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState<CustomerCategory>("pelanggan");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCategory, setEditCategory] = useState<CustomerCategory>("pelanggan");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const filtered = customers.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search);
    const matchTab = tab === "all" || c.category === tab;
    return matchSearch && matchTab;
  });

  const countPelanggan = customers.filter((c) => c.category === "pelanggan").length;
  const countSupplier = customers.filter((c) => c.category === "supplier").length;

  const filteredPelanggan = customers.filter((c) => c.category === "pelanggan" && (c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))).length;
  const filteredSupplier = customers.filter((c) => c.category === "supplier" && (c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))).length;

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    await addCustomer(name.trim(), phone.trim(), address.trim(), category);
    setName("");
    setPhone("");
    setAddress("");
    setCategory("pelanggan");
    setShowAdd(false);
  }

  function openEdit(c: typeof customers[0]) {
    setEditId(c.id);
    setEditName(c.name);
    setEditPhone(c.phone);
    setEditAddress(c.address);
    setEditCategory(c.category);
  }

  async function handleEditSave() {
    if (!editId || !editName.trim() || !editPhone.trim()) return;
    try {
      await updateCustomer(editId, editName.trim(), editPhone.trim(), editAddress.trim(), editCategory);
      setEditId(null);
    } catch (e: any) {
      alert("Gagal simpan: " + (e.message || e));
    }
  }

  async function handleBackup() {
    const tables = [
      "customers", "products", "orders", "order_items",
      "stock_movements", "accounts", "account_transactions", "product_discounts",
    ];
    try {
      const results: Record<string, any[]> = {};
      for (const table of tables) {
        const { data } = await supabase.from(table).select("*");
        results[table] = data || [];
      }
      const backup = {
        app: "jastip_mamanay",
        version: 1,
        exported_at: new Date().toISOString(),
        data: results,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-jastip-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Gagal membuat backup: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function toWaNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) return "";
    return cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned.startsWith("62") ? cleaned : "62" + cleaned;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 sm:px-8 pt-4 pb-3 relative z-10 space-y-4">

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-pink-500 animate-pulse" />
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Daftar Pelanggan</h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Kelola data pelanggan, supplier, dan kontak</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative flex-1 sm:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau telepon..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all"
                />
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="px-3.5 py-2 bg-pink-500 hover:bg-pink-600 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-sm shadow-pink-500/20 transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-[0.97]"
              >
                + Pelanggan
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <button
            onClick={() => navigate("/customers/upload")}
            className="flex items-center justify-center gap-2 p-3 bg-white hover:bg-purple-50/50 border border-slate-200/80 hover:border-purple-300 rounded-2xl transition-all shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 font-bold flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Upload className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-slate-800 leading-none">Import CSV</p>
              <p className="text-[10px] text-slate-400 mt-1">Upload data</p>
            </div>
            <span className="text-xs font-bold text-slate-700 sm:hidden">Import</span>
          </button>
          <button
            onClick={handleBackup}
            className="flex items-center justify-center gap-2 p-3 bg-white hover:bg-sky-50/50 border border-slate-200/80 hover:border-sky-300 rounded-2xl transition-all shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 font-bold flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Download className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-slate-800 leading-none">Backup Data</p>
              <p className="text-[10px] text-slate-400 mt-1">Export JSON</p>
            </div>
            <span className="text-xs font-bold text-slate-700 sm:hidden">Backup</span>
          </button>
          <button
            onClick={() => navigate("/piutang")}
            className="flex items-center justify-center gap-2 p-3 bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200/80 text-amber-700 rounded-2xl transition-all shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white font-bold flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm shadow-amber-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-amber-900 leading-none">Piutang</p>
              <p className="text-[10px] text-amber-600 mt-1">Tagihan</p>
            </div>
            <span className="text-xs font-bold text-amber-800 sm:hidden">Piutang</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white p-2.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
            <div className="w-8 h-8 mx-auto bg-pink-50 rounded-xl flex items-center justify-center text-pink-500 mb-1.5">
              <UserPlus className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase leading-none">Total</p>
            <p className="text-lg sm:text-xl font-black text-pink-600 mt-0.5 leading-tight">{filtered.length}</p>
            <p className="text-xs text-pink-400 font-semibold">Kontak</p>
          </div>
          <div className="bg-white p-2.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
            <div className="w-8 h-8 mx-auto bg-sky-50 rounded-xl flex items-center justify-center text-sky-500 mb-1.5">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase leading-none">Pelanggan</p>
            <p className="text-lg sm:text-xl font-black text-sky-600 mt-0.5 leading-tight">{tab === "all" ? countPelanggan : filteredPelanggan}</p>
            <p className="text-xs text-sky-400 font-semibold">Beli produk</p>
          </div>
          <div className="bg-white p-2.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
            <div className="w-8 h-8 mx-auto bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 mb-1.5">
              <Truck className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase leading-none">Supplier</p>
            <p className="text-lg sm:text-xl font-black text-amber-600 mt-0.5 leading-tight">{tab === "all" ? countSupplier : filteredSupplier}</p>
            <p className="text-xs text-amber-400 font-semibold">Pasok barang</p>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setTab("all")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 ${
              tab === "all"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold"
            }`}
          >
            Semua ({customers.length})
          </button>
          <button
            onClick={() => setTab("pelanggan")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 ${
              tab === "pelanggan"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            Pelanggan
            <span className="bg-sky-100 text-sky-700 font-bold px-1.5 py-0.5 rounded-full text-[10px]">{countPelanggan}</span>
          </button>
          <button
            onClick={() => setTab("supplier")}
            className={`px-4 py-2 font-bold text-xs rounded-full whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 ${
              tab === "supplier"
                ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Supplier
            <span className="bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full text-[10px]">{countSupplier}</span>
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4 relative z-10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-5">
              {tab === "supplier" ? (
                <Truck className="w-8 h-8 text-pink-300" />
              ) : (
                <ShoppingBag className="w-8 h-8 text-pink-300" />
              )}
            </div>
            <p className="text-slate-500 text-xl font-medium">
              {tab === "all"
                ? "Belum ada data"
                : tab === "supplier"
                  ? "Belum ada supplier"
                  : "Belum ada pelanggan"}
            </p>
            <p className="text-slate-300 text-base mt-1">
              Tap "+ Pelanggan" untuk menambah
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((customer) => (
              <div
                key={customer.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all p-4 cursor-pointer group"
                onClick={() => navigate(`/customer/${customer.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br border flex items-center justify-center font-bold text-sm shrink-0 ${getCustomerColor(customer.name)}`}>
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">{customer.name}</h3>
                      <span className={`text-xs px-1.5 py-0.5 font-bold rounded-full border ${
                        customer.category === "supplier"
                          ? "bg-amber-50 border-amber-200 text-amber-600"
                          : "bg-sky-50 border-sky-200 text-sky-600"
                      }`}>
                        {customer.category === "supplier" ? "Supplier" : "Pelanggan"}
                      </span>
                    </div>
                    {customer.phone ? (
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        {customer.phone}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-500 mt-0.5 flex items-center gap-1 font-semibold">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        Tanpa telepon
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {customer.phone && (
                      <button
                        onClick={() => {
                          const wa = toWaNumber(customer.phone);
                          if (wa) window.open(`https://wa.me/${wa}`, "_blank");
                        }}
                        className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 border border-slate-200/80 transition-all"
                        title="Chat WA"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(customer)}
                      className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 border border-slate-200/80 transition-all"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(customer.id)}
                      className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 border border-slate-200/80 transition-all"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => navigate(`/customer/${customer.id}`)}
                      className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 border border-slate-200/80 transition-all group-hover:text-pink-500"
                      title="Lihat Detail"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showAdd && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-start justify-center px-5 pt-16">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 pb-8 shadow-2xl shadow-pink-100/50 border border-pink-100 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />
            <h2 className="text-xl font-bold text-gray-800 mb-5">Pelanggan Baru</h2>
            <form onSubmit={handleAddCustomer} className="space-y-3">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all" required />
              <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="No. telepon (wajib)" className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all" />
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Alamat" className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all" />
              <div>
                <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">Kategori</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCategory("pelanggan")} className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${category === "pelanggan" ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30" : "bg-pink-50 text-gray-400 border border-pink-100"}`}>
                    <ShoppingBag className="w-4 h-4" /> Pelanggan
                  </button>
                  <button type="button" onClick={() => setCategory("supplier")} className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${category === "supplier" ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30" : "bg-pink-50 text-gray-400 border border-pink-100"}`}>
                    <Truck className="w-4 h-4" /> Supplier
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-2xl transition-all">Batal</button>
                <button type="submit" className="flex-1 py-3.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-pink-200/40">Tambah</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editId && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-start justify-center px-5 pt-16">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 pb-8 shadow-2xl shadow-pink-100/50 border border-pink-100 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />
            <h2 className="text-xl font-bold text-gray-800 mb-5">Edit Pelanggan</h2>
            <div className="space-y-3">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nama" className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all" />
              <input type="tel" required value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="No. telepon (wajib)" className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all" />
              <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Alamat" className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all" />
              <div>
                <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">Kategori</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditCategory("pelanggan")} className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${editCategory === "pelanggan" ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30" : "bg-pink-50 text-gray-400 border border-pink-100"}`}>
                    <ShoppingBag className="w-4 h-4" /> Pelanggan
                  </button>
                  <button type="button" onClick={() => setEditCategory("supplier")} className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${editCategory === "supplier" ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30" : "bg-pink-50 text-gray-400 border border-pink-100"}`}>
                    <Truck className="w-4 h-4" /> Supplier
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditId(null)} className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-2xl transition-all">Batal</button>
                <button type="button" onClick={handleEditSave} className="flex-1 py-3.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-pink-200/40">Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div className="bg-white border border-pink-100 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-pink-100/50">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Hapus Pelanggan?</h3>
            <p className="text-sm text-gray-400 mb-5">
              Data pelanggan <span className="font-semibold text-gray-600">{customers.find((c) => c.id === deleteConfirm)?.name}</span> akan dihapus.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-400 bg-gray-50 hover:bg-gray-100 transition-all">Batal</button>
              <button
                onClick={async () => {
                  try {
                    await deleteCustomer(deleteConfirm);
                    setDeleteConfirm(null);
                  } catch {
                    alert("Gagal menghapus pelanggan. Mungkin masih ada data terkait.");
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-all"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
