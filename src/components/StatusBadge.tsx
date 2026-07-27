import type { OrderStatus } from "../types";

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string }
> = {
  new: {
    label: "Baru",
    color: "bg-blue-50 text-blue-600 ring-1 ring-blue-200",
  },
  ready: {
    label: "Ready",
    color: "bg-teal-50 text-teal-600 ring-1 ring-teal-200",
  },
  paid: {
    label: "Lunas",
    color: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200",
  },
  shipped: {
    label: "Dikirim",
    color: "bg-amber-50 text-amber-600 ring-1 ring-amber-200",
  },
  delivered: {
    label: "Diterima",
    color: "bg-violet-50 text-violet-600 ring-1 ring-violet-200",
  },
  completed: {
    label: "Selesai",
    color: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",
  },
  deleted: {
    label: "Dihapus",
    color: "bg-red-50 text-red-500 ring-1 ring-red-200",
  },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${config.color}`}
    >
      {config.label}
    </span>
  );
}
