import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import {
  ShoppingBag,
  ClipboardList,
  Package,
  DollarSign,
  Wallet,
  LogOut,
} from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser, isOnline, setOnline } = useStore();

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

      <header className="shrink-0 bg-white/70 backdrop-blur-xl border-b border-pink-100/60 relative z-10">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Jastip_mamanay" className="w-10 h-10 rounded-xl object-contain bg-pink-50 border border-pink-100" />
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
                  Jastip_mamanay
                </h1>
                <div className="mt-0.5">
                  <span className="text-base text-gray-400">
                    {user?.name}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isOnline && (
                <span className="px-2.5 py-1 bg-amber-50 text-amber-500 text-xs font-semibold rounded-lg border border-amber-200">
                  OFFLINE
                </span>
              )}
              <button
                onClick={handleLogout}
                className="p-2.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-gray-400 transition-all border border-pink-100"
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
