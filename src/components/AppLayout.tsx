import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import QrisNotifier from "./QrisNotifier";
import CatalogOrderNotifier from "./CatalogOrderNotifier";
import TransferConfirmNotifier from "./TransferConfirmNotifier";
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
  Truck,
  Wrench,
  CreditCard,
} from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser, isOnline, setOnline, fontSize } = useStore();
  const [showQrisHistory, setShowQrisHistory] = useState(false);
  const [pendingConfCount, setPendingConfCount] = useState(0);

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

  useEffect(() => {
    async function checkPending() {
      try {
        const res = await fetch("/api/payment-confirm?action=list&status=pending");
        const json = await res.json();
        setPendingConfCount(json.data?.length || 0);
      } catch {}
    }
    checkPending();
    const interval = setInterval(checkPending, 30000);
    return () => clearInterval(interval);
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
            <div className="flex items-center gap-1">
              {!isOnline && (
                <span className="px-2 py-1 bg-amber-50 text-amber-500 text-[10px] font-semibold rounded-lg border border-amber-200">
                  OFFLINE
                </span>
              )}
              <button
                onClick={() => navigate("/maintenance")}
                className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-all"
                title="Perawatan"
              >
                <Wrench className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowQrisHistory(true)}
                className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-all relative"
                title="QRIS"
              >
                <BellRing className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
              </button>
              <button
                onClick={() => navigate("/payment-confirmations")}
                className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-all relative"
                title="Konfirmasi Bayar"
              >
                <CreditCard className="w-4 h-4" />
                {pendingConfCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center bg-amber-500 text-white text-[9px] font-bold rounded-full px-1">
                    {pendingConfCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate("/profile")}
                className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-all"
                title="Profil"
              >
                <User className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center transition-all"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative z-10 pb-14">
        {children}
      </div>

      <QrisNotifier />
      <CatalogOrderNotifier />
      <TransferConfirmNotifier />
      <QrisHistoryModal open={showQrisHistory} onClose={() => setShowQrisHistory(false)} />

      {!isSubPage && (
        <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-20" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="flex items-stretch max-w-lg mx-auto">
           {[
              { path: "/orders", icon: ClipboardList, label: "Order", match: (p: string) => p.startsWith("/orders") },
              { path: "/", icon: ShoppingBag, label: "Pelanggan", match: (p: string) => p === "/" },
              { path: "/shipments", icon: Truck, label: "Kirim", match: (p: string) => p === "/shipments" },
              { path: "/inventory", icon: Package, label: "Inventaris", match: (p: string) => p === "/inventory" },
              { path: "/sales", icon: DollarSign, label: "Laporan", match: (p: string) => p === "/sales" },
              { path: "/accounts", icon: Wallet, label: "Akun", match: (p: string) => p.startsWith("/accounts") },
            ].map(({ path, icon: Icon, label, match }) => {
              const active = match(location.pathname);
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 transition-all relative ${
                    active ? "text-pink-500" : "text-gray-400 active:text-gray-600"
                  }`}
                >
                  <div className={`relative flex items-center justify-center w-8 h-8 rounded-xl transition-all ${
                    active ? "bg-pink-50" : ""
                  }`}>
                    <Icon className={`w-[20px] h-[20px] transition-all ${active ? "stroke-[2.5px]" : "stroke-[1.8px]"}`} />
                    {active && (
                      <div className="absolute -bottom-1.5 w-4 h-[3px] rounded-full bg-pink-500" />
                    )}
                  </div>
                  <span className={`text-[10px] md:text-xs leading-tight ${active ? "font-bold" : "font-medium"}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
