import { useEffect, useState, useRef } from "react";
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

const NAV_ITEMS = [
  { path: "/orders", icon: ClipboardList, label: "Order", match: (p: string) => p.startsWith("/orders") || p.startsWith("/order/") },
  { path: "/", icon: ShoppingBag, label: "Pelanggan", match: (p: string) => p === "/" },
  { path: "/shipments", icon: Truck, label: "Kirim", match: (p: string) => p === "/shipments" },
  { path: "/inventory", icon: Package, label: "Inventaris", match: (p: string) => p === "/inventory" },
  { path: "/sales", icon: DollarSign, label: "Laporan", match: (p: string) => p === "/sales" },
  { path: "/accounts", icon: Wallet, label: "Akun", match: (p: string) => p.startsWith("/accounts") },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser, isOnline, setOnline, fontSize } = useStore();
  const [showQrisHistory, setShowQrisHistory] = useState(false);
  const [pendingConfCount, setPendingConfCount] = useState(0);
  const badgeVisibleRef = useRef(document.visibilityState !== "hidden");

  useEffect(() => {
    const onVis = () => { badgeVisibleRef.current = document.visibilityState !== "hidden"; };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

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
    const interval = setInterval(checkOnline, 60000);
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
      if (!badgeVisibleRef.current) return;
      try {
        const res = await fetch("/api/payment-confirm?action=list&status=pending");
        const json = await res.json();
        setPendingConfCount(json.data?.length || 0);
      } catch {}
    }
    checkPending();
    const interval = setInterval(checkPending, 120000);
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
    <div className="h-dvh flex bg-slate-50 sm:bg-[#f8fafc] relative overflow-hidden">
      {/* Decorative blurs - mobile only */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden sm:hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-200/30 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 bg-rose-100/40 rounded-full blur-3xl" />
      </div>

      {/* ===== SIDEBAR (desktop only) ===== */}
      <aside className="hidden sm:flex w-60 bg-white border-r border-slate-200 flex-col shrink-0 relative z-10">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 p-0.5 shadow-md shrink-0">
              <div className="w-full h-full bg-white rounded-full flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="M" className="w-8 h-8 object-contain" />
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent tracking-tight truncate">Jastip_mamanay</h1>
              <p className="text-[11px] text-slate-400 truncate">{user?.email || user?.name}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map(({ path, icon: Icon, label, match }) => {
            const active = match(location.pathname);
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  active
                    ? "bg-pink-50 text-pink-600 font-semibold"
                    : "text-slate-500 hover:bg-slate-50 font-medium"
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100 space-y-0.5">
          <button
            onClick={() => setShowQrisHistory(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 font-medium transition-all relative"
          >
            <BellRing className="w-[18px] h-[18px]" />
            QRIS
            <span className="absolute top-2 right-3 w-2 h-2 rounded-full bg-rose-500" />
          </button>
          <button
            onClick={() => navigate("/payment-confirmations")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 font-medium transition-all relative"
          >
            <CreditCard className="w-[18px] h-[18px]" />
            Konfirmasi Bayar
            {pendingConfCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center bg-amber-500 text-white text-[10px] font-bold rounded-full px-1">
                {pendingConfCount}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate("/maintenance")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 font-medium transition-all"
          >
            <Wrench className="w-[18px] h-[18px]" />
            Perawatan
          </button>
          <button
            onClick={() => navigate("/profile")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 font-medium transition-all"
          >
            <User className="w-[18px] h-[18px]" />
            Profil
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-rose-500 hover:bg-rose-50 font-medium transition-all"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Keluar
          </button>
        </div>
      </aside>

      {/* ===== MAIN AREA ===== */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        {/* Header - mobile only */}
        <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200/80 relative z-10 sticky top-0 sm:hidden">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 p-0.5 shadow-md shadow-pink-500/20 shrink-0">
                  <div className="w-full h-full bg-white rounded-full flex items-center justify-center overflow-hidden">
                    <img src="/logo.png" alt="M" className="w-7 h-7 object-contain" />
                  </div>
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm font-black bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent tracking-tight truncate">
                    Jastip_mamanay
                  </h1>
                  <p className="text-[10px] text-slate-400 font-semibold truncate">{user?.email || user?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!isOnline && (
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-500 text-[9px] font-semibold rounded-lg border border-amber-200">
                    OFFLINE
                  </span>
                )}
                <button
                  onClick={() => setShowQrisHistory(true)}
                  className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-all relative"
                  title="QRIS"
                >
                  <BellRing className="w-4 h-4" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="hidden sm:flex shrink-0 bg-white border-b border-slate-200 px-10 py-3 items-center justify-end gap-3 relative z-10">
          {!isOnline && (
            <span className="px-2 py-1 bg-amber-50 text-amber-500 text-xs font-semibold rounded-lg border border-amber-200">
              OFFLINE
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative z-10 pb-14 sm:pb-4">
          {children}
        </div>

        {/* Notifiers */}
        <QrisNotifier />
        <CatalogOrderNotifier />
        <TransferConfirmNotifier />
        <QrisHistoryModal open={showQrisHistory} onClose={() => setShowQrisHistory(false)} />

        {/* Bottom nav - mobile only */}
        {!isSubPage && (
          <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-20 sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="flex items-stretch max-w-lg mx-auto">
              {NAV_ITEMS.map(({ path, icon: Icon, label, match }) => {
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
                    <span className={`text-[10px] leading-tight ${active ? "font-bold" : "font-medium"}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
