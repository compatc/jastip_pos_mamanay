import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { lazy, Suspense, Component, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useStore } from "./stores/useStore";
import Login from "./pages/Login";
import AppLayout from "./components/AppLayout";
import { supabase } from "./lib/supabase";

const PayOrder = lazy(() => import("./pages/PayOrder"));
const Profile = lazy(() => import("./pages/Profile"));
const UploadCustomers = lazy(() => import("./pages/UploadCustomers"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CustomerOrders = lazy(() => import("./pages/CustomerOrders"));
const Orders = lazy(() => import("./pages/Orders"));
const BulkOrder = lazy(() => import("./pages/BulkOrder"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const NewOrderForm = lazy(() => import("./pages/NewOrderForm"));
const EditOrderForm = lazy(() => import("./pages/EditOrderForm"));
const Inventory = lazy(() => import("./pages/Inventory"));
const SalesDashboard = lazy(() => import("./pages/SalesDashboard"));
const UploadOrders = lazy(() => import("./pages/UploadOrders"));
const Accounts = lazy(() => import("./pages/Accounts"));
const AccountDetail = lazy(() => import("./pages/AccountDetail"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const Shipments = lazy(() => import("./pages/Shipments"));
const Expenses = lazy(() => import("./pages/Expenses"));
const PaymentConfirmations = lazy(() => import("./pages/PaymentConfirmations"));
const Catalog = lazy(() => import("./pages/Catalog"));
const Piutang = lazy(() => import("./pages/Piutang"));

function RouteFallback() {
  return (
    <div className="min-h-dvh bg-[#f8f7f4] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
    </div>
  );
}

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
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* <Route path="/register" element={<Register />} /> */}
            <Route path="/pay/:orderId" element={<PayOrder />} />
            <Route path="/pay" element={<PayOrder />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/catalog/:id" element={<Catalog />} />
          <Route
            path="/piutang"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Piutang />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Profile />
                </AppLayout>
              </ProtectedRoute>
            }
          />
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
            path="/maintenance"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Maintenance />
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
            path="/shipments"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Shipments />
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
            path="/customers/upload"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <UploadCustomers />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/bulk"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <BulkOrder />
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
            path="/expenses"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Expenses />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payment-confirmations"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <PaymentConfirmations />
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
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
