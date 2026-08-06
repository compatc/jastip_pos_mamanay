import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import {
  ArrowLeft, Store, CreditCard, Phone, Bell, QrCode, Package,
  Download, RefreshCw, Wrench, HelpCircle, MessageCircle, LogOut,
  ChevronRight, Shield, Database
} from "lucide-react";

export default function Accounts() {
  const { user, accounts, loadAccounts } = useStore();
  const navigate = useNavigate();
  const [notifEnabled, setNotifEnabled] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  const totalSaldo = accounts.reduce((s, a) => s + a.balance, 0);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const menuSections = [
    {
      title: "Toko",
      items: [
        { icon: Store, iconBg: "bg-pink-100", iconColor: "text-pink-500", label: "Profil Toko", desc: "Nama, alamat, logo toko", onClick: () => navigate("/profile") },
        { icon: CreditCard, iconBg: "bg-blue-100", iconColor: "text-blue-500", label: "Rekening Bank", desc: "BCA 5271330651 a.n. Nurul Azizah", onClick: () => navigate("/accounts/bank") },
        { icon: Phone, iconBg: "bg-green-100", iconColor: "text-green-500", label: "Nomor WhatsApp", desc: user?.phone || "Belum diatur", onClick: () => navigate("/profile") },
      ]
    },
    {
      title: "Pengaturan",
      items: [
        { icon: Bell, iconBg: "bg-purple-100", iconColor: "text-purple-500", label: "Notifikasi", desc: "Notifikasi order masuk", toggle: true, toggleValue: notifEnabled, onToggle: () => setNotifEnabled(!notifEnabled) },
        { icon: QrCode, iconBg: "bg-amber-100", iconColor: "text-amber-500", label: "QRIS", desc: "Pengaturan pembayaran QRIS", badge: "Aktif", onClick: () => alert("Pengaturan QRIS - Segera hadir") },
        { icon: Package, iconBg: "bg-slate-100", iconColor: "text-slate-500", label: "Stok Minimum", desc: "Alert stok rendah otomatis", onClick: () => alert("Stok Minimum - Segera hadir") },
      ]
    },
    {
      title: "Data",
      items: [
        { icon: Download, iconBg: "bg-blue-100", iconColor: "text-blue-500", label: "Export Data", desc: "Download data order & produk", onClick: () => alert("Export Data - Segera hadir") },
        { icon: RefreshCw, iconBg: "bg-green-100", iconColor: "text-green-500", label: "Backup & Restore", desc: "Cadangkan data ke cloud", onClick: () => alert("Backup & Restore - Segera hadir") },
        { icon: Wrench, iconBg: "bg-red-100", iconColor: "text-red-500", label: "Maintenance", desc: "Audit & perbaiki stok", onClick: () => navigate("/maintenance") },
      ]
    },
    {
      title: "Bantuan",
      items: [
        { icon: HelpCircle, iconBg: "bg-green-100", iconColor: "text-green-500", label: "FAQ", desc: "Pertanyaan umum", onClick: () => alert("FAQ - Segera hadir") },
        { icon: MessageCircle, iconBg: "bg-pink-100", iconColor: "text-pink-500", label: "Hubungi Support", desc: "Chat via WhatsApp", onClick: () => window.open("https://wa.me/6281234567890", "_blank") },
      ]
    }
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <main className="px-4 py-4 relative z-10 flex-1 overflow-y-auto pb-6">
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-pink-400 to-rose-500 rounded-2xl p-5 mb-4 shadow-lg shadow-pink-200/40">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center text-2xl font-extrabold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "N"}
            </div>
            <div className="flex-1">
              <p className="text-lg font-extrabold text-white">{user?.name || "NAY"}</p>
              <p className="text-xs text-pink-100">{user?.email || "nurulazizahy@gmail.com"}</p>
              <span className="inline-block px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold text-white mt-1">
                👑 Owner
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-extrabold text-white">247</p>
              <p className="text-[10px] text-pink-100 font-semibold">Total Order</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-extrabold text-white">89</p>
              <p className="text-[10px] text-pink-100 font-semibold">Pelanggan</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-extrabold text-white">12</p>
              <p className="text-[10px] text-pink-100 font-semibold">Produk</p>
            </div>
          </div>
        </div>

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <div key={section.title} className="bg-white border border-slate-100 rounded-2xl mb-3 overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{section.title}</p>
            </div>
            {section.items.map((item) => (
              <div
                key={item.label}
                onClick={item.toggle ? item.onToggle : item.onClick}
                className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-b-0 active:bg-slate-50 transition-all cursor-pointer"
              >
                <div className={`w-9 h-9 rounded-xl ${item.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <item.icon className={`w-4 h-4 ${item.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <p className="text-[11px] text-slate-400 truncate">{item.desc}</p>
                </div>
                {item.badge && (
                  <span className="px-2 py-0.5 bg-pink-500 text-white text-[10px] font-bold rounded">
                    {item.badge}
                  </span>
                )}
                {item.toggle ? (
                  <div className={`w-11 h-6 rounded-full relative transition-all cursor-pointer ${
                    item.toggleValue ? "bg-pink-500" : "bg-slate-200"
                  }`}>
                    <div className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-all shadow-sm ${
                      item.toggleValue ? "left-[22px]" : "left-0.5"
                    }`} />
                  </div>
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-2xl border border-red-200 bg-white text-red-500 font-bold text-sm flex items-center justify-center gap-2 mb-3 active:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Keluar
        </button>

        <p className="text-center text-[11px] text-slate-400">POS NAY v2.0</p>
      </main>
    </div>
  );
}
