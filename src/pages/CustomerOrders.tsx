import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import ConfirmationModal from "../components/ConfirmationModal";
import {
  ArrowLeft,
  Plus,
  Package,
  Trash2,
} from "lucide-react";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function shortId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return "NAY" + String(Math.abs(hash) % 10000).padStart(4, "0");
}

const STATUS_LABELS: Record<string, string> = {
  new: "Baru",
  paid: "Dibayar",
  shipped: "Dikirim",
  delivered: "Diterima",
  completed: "Selesai",
};

function getOrderStatusColor(order: any): string {
  const isPaid = order.paid_total >= order.total && order.total > 0;
  if (order.status === "completed" && !isPaid) {
    return "bg-red-50 text-red-500 border-red-200";
  }
  if (order.status === "completed" && isPaid) {
    return "bg-emerald-50 text-emerald-500 border-emerald-100";
  }
  return "bg-yellow-50 text-yellow-600 border-yellow-200";
}

export default function CustomerOrders() {
  const { customerId } = useParams<{ customerId: string }>();
  const {
    orders,
    loadOrders,
    customers,
    loadCustomers,
    deleteOrder,
  } = useStore();
  const navigate = useNavigate();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmOnConfirm, setConfirmOnConfirm] = useState<(() => void) | null>(null);

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmOnConfirm(() => onConfirm);
    setConfirmVisible(true);
  }

  useEffect(() => {
    if (customerId) {
      loadCustomers();
      loadOrders(customerId);
    }
  }, [customerId]);

  const customer = customers.find((c) => c.id === customerId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 relative flex flex-col">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-200/30 rounded-full blur-3xl" />
      </div>

      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl border-b border-pink-100/60 shrink-0">
        <div className="px-5 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2.5 hover:bg-pink-50 rounded-xl transition-all border border-pink-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">
              {customer?.name || "Pelanggan"}
            </h1>
            <p className="text-sm text-gray-400">
              {customer?.phone || "Tanpa telepon"}
            </p>
          </div>
          <button
            onClick={() =>
              navigate("/orders/new", {
                state: {
                  contactName: customer?.name,
                  returnTo: `/customer/${customerId}`,
                },
              })
            }
            className="px-4 py-2.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl font-medium text-base flex items-center gap-1.5 transition-all shadow-lg shadow-pink-200/40 active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" />
            Order
          </button>
        </div>
      </header>

      <main className="flex-1 px-5 py-6 relative z-10 max-w-7xl w-full mx-auto">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-800">
            Transaksi ({orders.length})
          </h2>
        </div>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 bg-pink-50 border border-pink-100 rounded-3xl flex items-center justify-center mb-5">
              <Package className="w-8 h-8 text-pink-300" />
            </div>
            <p className="text-gray-500 text-xl font-medium">
              Belum ada transaksi
            </p>
            <p className="text-gray-300 text-base mt-1">
              Tap "Order" untuk membuat baru
            </p>
          </div>
        ) : (
          <div className="bg-white/90 border border-pink-100/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-pink-100/60 bg-pink-50/50 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Total</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pink-100/40 text-sm">
                  {orders.map((order) => {
                    return (
                      <tr
                        key={order.id}
                        onClick={() =>
                          navigate(`/orders/${order.id}/edit`, {
                            state: { returnTo: `/customer/${customerId}` },
                          })
                        }
                        className="hover:bg-pink-50/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-4 font-bold text-pink-600 whitespace-nowrap">
                          {shortId(order.id)}
                        </td>
                        <td className="py-3.5 px-4 text-gray-600 whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString(
                            "id-ID",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-gray-800 whitespace-nowrap">
                          {rupiah(order.total)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold border ${getOrderStatusColor(
                              order
                            )}`}
                          >
                            {STATUS_LABELS[order.status] || order.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              showConfirm(
                                "Hapus Order?",
                                "Apakah kamu yakin ingin menghapus order ini? Stok produk akan dikembalikan.",
                                async () => {
                                  await deleteOrder(order.id);
                                  await loadOrders(customerId!);
                                }
                              );
                            }}
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all border border-red-100"
                            title="Hapus Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <ConfirmationModal
        visible={confirmVisible}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={() => {
          if (confirmOnConfirm) confirmOnConfirm();
          setConfirmVisible(false);
        }}
        onCancel={() => setConfirmVisible(false)}
      />
    </div>
  );
}
