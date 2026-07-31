import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import type { CustomerCategory } from "../types";
import {
  UserPlus,
  Search,
  ShoppingBag,
  ArrowRight,
  Truck,
  Pencil,
  Trash2,
  Download,
} from "lucide-react";

type TabFilter = "all" | "pelanggan" | "supplier";

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
  const [category, setCategory] =
    useState<CustomerCategory>("pelanggan");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCategory, setEditCategory] =
    useState<CustomerCategory>("pelanggan");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const filtered = customers.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search);
    const matchTab =
      tab === "all" || c.category === tab;
    return matchSearch && matchTab;
  });

  const countPelanggan = customers.filter(
    (c) => c.category === "pelanggan"
  ).length;
  const countSupplier = customers.filter(
    (c) => c.category === "supplier"
  ).length;

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addCustomer(
      name.trim(),
      phone.trim(),
      address.trim(),
      category
    );
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
    if (!editId || !editName.trim()) return;
    await updateCustomer(
      editId,
      editName.trim(),
      editPhone.trim(),
      editAddress.trim(),
      editCategory
    );
    setEditId(null);
  }

  async function handleBackup() {
    const tables = [
      "customers",
      "products",
      "orders",
      "order_items",
      "stock_movements",
      "accounts",
      "account_transactions",
      "product_discounts",
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
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-4 pb-3 relative z-10">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pelanggan..."
              className="w-full pl-10 pr-4 py-3 bg-white/80 border border-pink-100 rounded-xl text-gray-700 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
            />
          </div>
          <button
            onClick={handleBackup}
            className="w-11 h-11 shrink-0 px-0 py-3 bg-white/80 border border-pink-100 hover:bg-pink-50 text-gray-500 hover:text-pink-500 rounded-xl flex items-center justify-center transition-all active:scale-95"
            title="Backup Data"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="w-28 px-4 py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl font-medium text-base flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-pink-200/40 shrink-0 active:scale-[0.97]"
          >
            <UserPlus className="w-4 h-4" />
            Baru
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setTab("all")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all ${
              tab === "all"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            Semua ({customers.length})
          </button>
          <button
            onClick={() => setTab("pelanggan")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all flex items-center gap-1.5 ${
              tab === "pelanggan"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            <ShoppingBag className="w-3 h-3" />
            Pelanggan ({countPelanggan})
          </button>
          <button
            onClick={() => setTab("supplier")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-all flex items-center gap-1.5 ${
              tab === "supplier"
                ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                : "bg-pink-50 text-gray-400 hover:bg-pink-100 border border-pink-100"
            }`}
          >
            <Truck className="w-3 h-3" />
            Supplier ({countSupplier})
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-5 pb-4 relative z-10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-5">
              {tab === "supplier" ? (
                <Truck className="w-8 h-8 text-pink-300" />
              ) : (
                <ShoppingBag className="w-8 h-8 text-pink-300" />
              )}
            </div>
            <p className="text-gray-500 text-xl font-medium">
              {tab === "all"
                ? "Belum ada data"
                : tab === "supplier"
                  ? "Belum ada supplier"
                  : "Belum ada pelanggan"}
            </p>
            <p className="text-gray-300 text-base mt-1">
              Tap "Baru" untuk menambah
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((customer) => (
              <div
                key={customer.id}
                className="bg-white/80 hover:bg-white border border-pink-100/60 rounded-2xl p-4 flex items-center justify-between transition-all text-left group active:scale-[0.98] shadow-sm shadow-pink-50"
              >
                <button
                  onClick={() => navigate(`/customer/${customer.id}`)}
                  className="flex items-center gap-4 flex-1"
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                      customer.category === "supplier"
                        ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/50"
                        : "bg-gradient-to-br from-pink-100 to-rose-100 border-pink-200/50"
                    }`}
                  >
                    {customer.category === "supplier" ? (
                      <Truck className="w-5 h-5 text-amber-500" />
                    ) : (
                      <span className="text-pink-500 font-bold text-base">
                        {customer.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-gray-800 font-semibold text-base">
                        {customer.name}
                      </p>
                      {customer.category === "supplier" && (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-xs font-bold uppercase tracking-wider border border-amber-100">
                          Supplier
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-base">
                      {customer.phone || "Tanpa telepon"}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(customer);
                    }}
                    className="p-3 hover:bg-pink-50 rounded-xl transition-all active:scale-95"
                  >
                    <Pencil className="w-5 h-5 text-gray-400" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(customer.id);
                    }}
                    className="p-3 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                  >
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </button>
                  <button
                    onClick={() => navigate(`/customer/${customer.id}`)}
                    className="p-3 hover:bg-pink-50 rounded-xl transition-all active:scale-95"
                  >
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </button>
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
            <h2 className="text-xl font-bold text-gray-800 mb-5">
              Pelanggan Baru
            </h2>
            <form onSubmit={handleAddCustomer} className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama"
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
                required
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="No. telepon"
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
              />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Alamat"
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
              />
              <div>
                <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                  Kategori
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCategory("pelanggan")}
                    className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${
                      category === "pelanggan"
                        ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                        : "bg-pink-50 text-gray-400 border border-pink-100"
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Pelanggan
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory("supplier")}
                    className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${
                      category === "supplier"
                        ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                        : "bg-pink-50 text-gray-400 border border-pink-100"
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    Supplier
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-2xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-pink-200/40"
                >
                  Tambah
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editId && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 flex items-start justify-center px-5 pt-16">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 pb-8 shadow-2xl shadow-pink-100/50 border border-pink-100 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />
            <h2 className="text-xl font-bold text-gray-800 mb-5">
              Edit Pelanggan
            </h2>
            <div className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nama"
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
              />
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="No. telepon"
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
              />
              <input
                type="text"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                placeholder="Alamat"
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
              />
              <div>
                <label className="block text-base text-gray-400 mb-2 uppercase tracking-widest font-semibold">
                  Kategori
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditCategory("pelanggan")}
                    className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${
                      editCategory === "pelanggan"
                        ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                        : "bg-pink-50 text-gray-400 border border-pink-100"
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Pelanggan
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCategory("supplier")}
                    className={`flex-1 py-3 rounded-2xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${
                      editCategory === "supplier"
                        ? "bg-gradient-to-r from-pink-400 to-rose-500 text-white shadow-md shadow-pink-200/30"
                        : "bg-pink-50 text-gray-400 border border-pink-100"
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    Supplier
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium rounded-2xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  className="flex-1 py-3.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-pink-200/40"
                >
                  Simpan
                </button>
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
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-400 bg-gray-50 hover:bg-gray-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteCustomer(deleteConfirm);
                    setDeleteConfirm(null);
                  } catch (err) {
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
