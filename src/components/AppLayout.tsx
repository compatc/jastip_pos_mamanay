import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import QrisNotifier from "./QrisNotifier";
import QrisHistoryModal from "./QrisHistoryModal";
import {
  ShoppingBag,
  ClipboardList,
  Package,
  DollarSign,
  Wallet,
  LogOut,
  User,
  BellRing,
  Wrench,
} from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser, isOnline, setOnline, fontSize } = useStore();
  const [showQrisHistory, setShowQrisHistory] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-fs", fontSize);
  }, [fontSize]);

  useEffect(() => {
    const checkOnline = async () => {
      if (!navigator.onLine) {
        setOnline(false);
        return;
      }
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        await fetch("https://tmnykmpdqdavspmirspw.supabase.co/rest/v1/?select=1", {
          method: "HEAD",
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        setOnline(true);
      } catch {
        setOnline(false);
      }
    };

    checkOnline();
    const interval = setInterval(checkOnline, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleOffline = () => setOnline(false);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function handleLogout() {
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // ignore signOut errors
    }
    setUser(null);
    navigate("/login");
  }

  const isSubPage =
    location.pathname.startsWith("/customer/") ||
    location.pathname.startsWith("/order/") ||
    location.pathname.startsWith("/orders/new") ||
    (location.pathname.startsWith("/orders/") && !["/orders", "/orders/upload", "/orders/bulk"].includes(location.pathname));

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-pink-50 via-white to-rose-50 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-200/30 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 bg-rose-100/40 rounded-full blur-3xl" />
      </div>

      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200/80 relative z-10 sticky top-0">
        <div className="px-4 sm:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-400 p-0.5 shadow-md shadow-pink-500/20 shrink-0">
                <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center overflow-hidden">
                  <img src="/logo.png" alt="M" className="w-8 h-8 object-contain" />
                </div>
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent tracking-tight">
                  Jastip_mamanay
                </h1>
                <p className="text-[11px] text-slate-400 font-semibold">{user?.name} · Admin</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {!isOnline && (
                <span className="px-2.5 py-1 bg-amber-50 text-amber-500 text-xs font-semibold rounded-xl border border-amber-200">
                  OFFLINE
                </span>
              )}
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-bold rounded-xl">
                <span className={`w-2 h-2 rounded-full bg-emerald-500 ${isOnline ? "animate-pulse" : ""}`} /> ONLINE
              </span>
              <button
                onClick={() => navigate("/maintenance")}
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80 transition-all"
                title="Perawatan Data"
              >
                <Wrench className="w-4 h-4 stroke-[2]" />
              </button>
              <button
                onClick={() => setShowQrisHistory(true)}
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80 transition-all relative"
                title="Notifikasi QRIS"
              >
                <BellRing className="w-4 h-4 stroke-[2]" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
              </button>
              <button
                onClick={() => navigate("/profile")}
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80 transition-all"
                title="Profil"
              >
                <User className="w-4 h-4 stroke-[2]" />
              </button>
              <button
                onClick={handleLogout}
                className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 transition-all"
                title="Keluar"
              >
                <LogOut className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative z-10 pb-14">
        {children}
      </div>

      <QrisNotifier />
      <QrisHistoryModal open={showQrisHistory} onClose={() => setShowQrisHistory(false)} />

      {!isSubPage && (
        <nav className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur-xl border-t border-pink-100/60 z-20">
          <div className="flex">
           <button
                onClick={() => navigate("/orders")}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                  location.pathname.startsWith("/orders") ? "text-pink-500" : "text-gray-300 hover:text-gray-500"
                }`}
              >
                <ClipboardList className="w-[18px] h-[18px]" />
                <span className="text-[11px] font-semibold uppercase">
                  Order
                </span>
              </button>
              <button
                onClick={() => navigate("/")}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                  location.pathname === "/" ? "text-pink-500" : "text-gray-300 hover:text-gray-500"
                }`}
              >
                <ShoppingBag className="w-[18px] h-[18px]" />
                <span className="text-[11px] font-semibold uppercase">
                  Pelanggan
                </span>
              </button>
            <button
              onClick={() => navigate("/inventory")}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                location.pathname === "/inventory" ? "text-pink-500" : "text-gray-300 hover:text-gray-500"
              }`}
            >
              <Package className="w-[18px] h-[18px]" />
              <span className="text-[11px] font-semibold uppercase">
                Inventaris
              </span>
            </button>
            <button
              onClick={() => navigate("/sales")}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                location.pathname === "/sales" ? "text-pink-500" : "text-gray-300 hover:text-gray-500"
              }`}
            >
              <DollarSign className="w-[18px] h-[18px]" />
              <span className="text-[11px] font-semibold uppercase">
                Laporan
              </span>
            </button>
            <button
              onClick={() => navigate("/accounts")}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                location.pathname.startsWith("/accounts") ? "text-pink-500" : "text-gray-300 hover:text-gray-500"
              }`}
            >
              <Wallet className="w-[18px] h-[18px]" />
              <span className="text-[11px] font-semibold uppercase">
                Akun
              </span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
