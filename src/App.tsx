import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useStore } from "./stores/useStore";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CustomerOrders from "./pages/CustomerOrders";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import NewOrderForm from "./pages/NewOrderForm";
import EditOrderForm from "./pages/EditOrderForm";
import Inventory from "./pages/Inventory";
import SalesDashboard from "./pages/SalesDashboard";
import UploadOrders from "./pages/UploadOrders";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import AppLayout from "./components/AppLayout";
import { Component, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { supabase } from "./lib/supabase";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App Error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 flex items-center justify-center p-4">
          <div className="bg-white/80 border border-pink-100 rounded-3xl p-8 max-w-md w-full shadow-xl shadow-pink-100/30">
            <h1 className="text-xl font-bold text-red-400 mb-4">
              Terjadi Kesalahan
            </h1>
            <pre className="text-gray-500 text-sm bg-pink-50/50 border border-pink-100 p-4 rounded-2xl overflow-auto max-h-64">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="mt-5 w-full py-3.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-pink-200/40"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const currentUser = useStore.getState().user;
        if (currentUser?.auth_source === "offline") return;
        useStore.getState().setUser({
          id: session.user.id,
          email: session.user.email || "",
          name: session.user.user_metadata?.name || session.user.email || "User",
          auth_source: "supabase",
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const currentUser = useStore.getState().user;
        if (currentUser?.auth_source === "offline") return;
        useStore.getState().setUser({
          id: session.user.id,
          email: session.user.email || "",
          name: session.user.user_metadata?.name || session.user.email || "User",
          auth_source: "supabase",
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customer/:customerId"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <CustomerOrders />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Inventory />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <SalesDashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Orders />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/new"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <NewOrderForm />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/upload"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <UploadOrders />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <OrderDetail />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId/edit"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <EditOrderForm />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Accounts />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/:id"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <AccountDetail />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
