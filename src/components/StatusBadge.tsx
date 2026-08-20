import type { PaymentStatus, FulfillmentStatus } from "../types";

const paymentConfig: Record<PaymentStatus, { label: string; color: string }> = {
  unpaid: {
    label: "Belum Bayar",
    color: "bg-red-50 text-red-600 ring-1 ring-red-200",
  },
  dp: {
    label: "DP",
    color: "bg-yellow-50 text-yellow-600 ring-1 ring-yellow-200",
  },
  paid: {
    label: "Lunas",
    color: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200",
  },
};

const fulfillmentConfig: Record<FulfillmentStatus, { label: string; color: string }> = {
  belum_ready: {
    label: "Belum Ready",
    color: "bg-orange-50 text-orange-600 ring-1 ring-orange-200",
  },
  ready: {
    label: "Stok Ready",
    color: "bg-teal-50 text-teal-600 ring-1 ring-teal-200",
  },
  shipped: {
    label: "Dikirim",
    color: "bg-violet-50 text-violet-600 ring-1 ring-violet-200",
  },
  diterima: {
    label: "Diterima",
    color: "bg-blue-50 text-blue-600 ring-1 ring-blue-200",
  },
  completed: {
    label: "Selesai",
    color: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",
  },
  cancelled: {
    label: "Dibatalkan",
    color: "bg-red-50 text-red-500 ring-1 ring-red-200",
  },
};

export function StatusBadge({
  paymentStatus,
  fulfillmentStatus,
}: {
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
}) {
  const p = paymentConfig[paymentStatus];
  const f = fulfillmentConfig[fulfillmentStatus];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold ${p.color}`}>
        {p.label}
      </span>
      <span className={`inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold ${f.color}`}>
        {f.label}
      </span>
    </span>
  );
}
