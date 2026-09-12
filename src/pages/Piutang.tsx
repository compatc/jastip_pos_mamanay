import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import { ArrowLeft, MessageCircle, Clock, AlertTriangle, CheckCircle } from "lucide-react";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getAgingBadge(days: number) {
  if (days <= 30) return { label: `${days}h`, cls: "bg-yellow-100 text-yellow-700" };
  if (days <= 60) return { label: `${days}h`, cls: "bg-orange-100 text-orange-700" };
  if (days <= 90) return { label: `${days}h`, cls: "bg-red-100 text-red-700" };
  return { label: `${days}h`, cls: "bg-red-200 text-red-800 font-bold" };
}

type PiutangCustomer = {
  customerId: string;
  name: string;
  phone: string;
  totalHutang: number;
  orderCount: number;
  oldestDays: number;
  oldestDate: string;
  orders: { id: string; total: number; paid: number; sisa: number; created_at: string; productNames: string }[];
};

export default function Piutang() {
  const navigate = useNavigate();
  const { allOrders, loadAllOrders, customers, loadCustomers, products, loadProducts } = useStore();
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, { product_name: string; variant?: string | null }[]>>({});
  const [search, setSearch] = useState("");
  const [agingFilter, setAgingFilter] = useState<"all" | "30" | "60" | "90" | "90+">("all");

  useEffect(() => {
    loadAllOrders();
    loadCustomers();
    loadProducts();
  }, []);

  useEffect(() => {
    async function loadItems() {
      const unpaidOrders = allOrders.filter((o) => o.payment_status !== "paid");
      if (unpaidOrders.length === 0) { setItemsByOrder({}); return; }

      const customerIds = [...new Set(unpaidOrders.map((o) => o.customer_id).filter(Boolean))];
      if (customerIds.length === 0) { setItemsByOrder({}); return; }

      const { data: custOrders } = await supabase
        .from("orders")
        .select("id, customer_id")
        .in("customer_id", customerIds);

      const orderIds = (custOrders || []).map((o) => o.id);
      if (orderIds.length === 0) { setItemsByOrder({}); return; }

      const { data: allItems } = await supabase
        .from("order_items")
        .select("order_id, product_name, variant")
        .in("order_id", orderIds);

      const map: Record<string, { product_name: string; variant?: string | null }[]> = {};
      for (const item of allItems || []) {
        if (!map[item.order_id]) map[item.order_id] = [];
        map[item.order_id].push({ product_name: item.product_name, variant: item.variant });
      }
      setItemsByOrder(map);
    }
    if (allOrders.length > 0) loadItems();
  }, [allOrders]);

  const piutangData = useMemo(() => {
    const unpaidOrders = allOrders.filter((o) => {
      const sisa = (o.total - (o.diskon || 0)) - (o.paid_total || 0);
      return sisa > 0 && o.payment_status !== "paid" && o.fulfillment_status !== "cancelled";
    });

    const custMap = new Map<string, PiutangCustomer>();
    for (const order of unpaidOrders) {
      const custId = order.customer_id || "none";
      const cust = customers.find((c) => c.id === custId);
      const existing = custMap.get(custId);
      const sisa = (order.total - (order.diskon || 0)) - (order.paid_total || 0);
      const days = daysSince(order.created_at);
      const items = itemsByOrder[order.id] || [];
      const productNames = items.map((i) => i.variant ? `${i.product_name} ${i.variant}` : i.product_name).join(", ") || "-";

      if (existing) {
        existing.totalHutang += sisa;
        existing.orderCount++;
        existing.orders.push({ id: order.id, total: order.total, paid: order.paid_total || 0, sisa, created_at: order.created_at, productNames });
        if (days > existing.oldestDays) {
          existing.oldestDays = days;
          existing.oldestDate = order.created_at;
        }
      } else {
        custMap.set(custId, {
          customerId: custId,
          name: cust?.name || order.customer_name || "Tanpa Nama",
          phone: cust?.phone || "",
          totalHutang: sisa,
          orderCount: 1,
          oldestDays: days,
          oldestDate: order.created_at,
          orders: [{ id: order.id, total: order.total, paid: order.paid_total || 0, sisa, created_at: order.created_at, productNames }],
        });
      }
    }

    return [...custMap.values()].sort((a, b) => b.oldestDays - a.oldestDays);
  }, [allOrders, customers, itemsByOrder]);

  const filtered = useMemo(() => {
    let result = piutangData;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    if (agingFilter === "30") result = result.filter((c) => c.oldestDays <= 30);
    else if (agingFilter === "60") result = result.filter((c) => c.oldestDays > 30 && c.oldestDays <= 60);
    else if (agingFilter === "90") result = result.filter((c) => c.oldestDays > 60 && c.oldestDays <= 90);
    else if (agingFilter === "90+") result = result.filter((c) => c.oldestDays > 90);
    return result;
  }, [piutangData, search, agingFilter]);

  const totalPiutang = piutangData.reduce((s, c) => s + c.totalHutang, 0);
  const totalCustomers = piutangData.length;

  function toWaNumber(phone: string): string | null {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, "");
    if (digits.startsWith("0")) digits = "62" + digits.slice(1);
    if (!digits.startsWith("62")) digits = "62" + digits;
    if (digits.length < 10) return null;
    return digits;
  }

  function sendReminder(c: PiutangCustomer) {
    const wa = toWaNumber(c.phone);
    if (!wa) return;
    const msg = `Halo Kak ${c.name} 🙏\n\nIni pengingat untuk pesanan yang belum dibayar:\n\n` +
      c.orders.map((o) => `• ${o.productNames}\n  Total: ${rupiah(o.total)} | Dibayar: ${rupiah(o.paid)} | Sisa: *${rupiah(o.sisa)}*`).join("\n\n") +
      `\n\n💰 Total sisa: *${rupiah(c.totalHutang)}*\n\n` +
      `🏦 BCA 5271330651 a.n. Nurul Azizah\n\nTerima kasih 🙏`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate("/")} className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-800">Piutang</h1>
            <p className="text-sm text-slate-400">{totalCustomers} pelanggan · {rupiah(totalPiutang)}</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "0-30 hari", filter: "30" as const, color: "yellow", data: piutangData.filter((c) => c.oldestDays <= 30) },
            { label: "31-60 hari", filter: "60" as const, color: "orange", data: piutangData.filter((c) => c.oldestDays > 30 && c.oldestDays <= 60) },
            { label: "61-90 hari", filter: "90" as const, color: "red", data: piutangData.filter((c) => c.oldestDays > 60 && c.oldestDays <= 90) },
            { label: ">90 hari", filter: "90+" as const, color: "red", data: piutangData.filter((c) => c.oldestDays > 90) },
          ].map((item) => (
            <button
              key={item.filter}
              onClick={() => setAgingFilter(agingFilter === item.filter ? "all" : item.filter)}
              className={`bg-white border rounded-xl p-3 text-center transition-all ${
                agingFilter === item.filter ? "border-pink-400 ring-2 ring-pink-100" : "border-slate-100"
              }`}
            >
              <div className={`text-lg font-extrabold text-${item.color}-500`}>
                {item.data.length}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-medium">{item.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {rupiah(item.data.reduce((s, c) => s + c.totalHutang, 0))}
              </div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Cari pelanggan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
          />
        </div>
      </div>

      {/* List */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
              <p className="font-bold text-slate-600">Tidak ada piutang</p>
              <p className="text-sm">Semua pelanggan sudah lunas</p>
            </div>
          )}
          {filtered.map((c) => {
            const aging = getAgingBadge(c.oldestDays);
            return (
              <div key={c.customerId} className="bg-white border border-slate-100 rounded-xl p-4 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-500 font-bold flex items-center justify-center text-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.phone || "Tanpa HP"} · {c.orderCount} order</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold text-red-500">{rupiah(c.totalHutang)}</div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${aging.cls}`}>
                      <Clock className="w-3 h-3 inline mr-0.5" />
                      {aging.label}
                    </span>
                  </div>
                </div>

                {/* Detail orders */}
                <div className="bg-slate-50 rounded-lg p-2 mb-3 space-y-1">
                  {c.orders.map((o) => (
                    <div key={o.id} className="flex justify-between text-xs text-slate-600">
                      <span className="truncate flex-1 mr-2">{o.productNames}</span>
                      <span className="text-red-500 font-medium shrink-0">Sisa {rupiah(o.sisa)}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {c.phone && (
                    <button
                      onClick={() => sendReminder(c)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Kirim Pengingat
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/customer/${c.customerId}`)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all"
                  >
                    Lihat Detail
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
