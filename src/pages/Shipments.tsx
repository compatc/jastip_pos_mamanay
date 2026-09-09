import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import {
  ArrowLeft,
  Package,
  Truck,
  Clock,
  MessageCircle,
  CheckCircle2,
  Undo2,
  Calendar,
  Camera,
  Image,
  X,
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

function itemLabel(i: { product_name: string; variant?: string | null }) {
  return i.variant ? `${i.product_name} ${i.variant}` : i.product_name;
}

interface OrderItemData {
  product_name: string;
  variant?: string | null;
  quantity: number;
  price: number;
  stock: number;
}

interface ShipmentOrder {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  total: number;
  paid_total: number;
  notes: string;
  qris_notes: string;
  created_at: string;
  shipped_at: string | null;
  packing_photo: string | null;
  items: OrderItemData[];
  isHold: boolean;
  holdReason: string;
}

type FilterType = "all" | "ready" | "hold" | "shipped";

function isOrderLunas(o: { paid_total: number; total: number; diskon?: number }) {
  return (o.paid_total || 0) >= ((o.total || 0) - (o.diskon || 0)) && o.total > 0;
}

function isHold(notes: string): boolean {
  return notes?.includes("[DITUNDA]");
}

function getHoldReason(notes: string): string {
  const match = notes?.match(/\[DITUNDA\]\s*(.*)/);
  return match ? match[1] : "";
}

export default function Shipments() {
  const navigate = useNavigate();
  const { allOrders, loadAllOrders, customers, loadCustomers } = useStore();
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemData[]>>({});
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<number>>>({});
  const [search, setSearch] = useState("");
  const [shippedOrders, setShippedOrders] = useState<ShipmentOrder[]>([]);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [photoPreview, setPhotoPreview] = useState<Record<string, string | null>>({});
  const [photoFile, setPhotoFile] = useState<Record<string, File | null>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function compressPhoto(file: File): Promise<Blob> {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h / w) * maxDim); w = maxDim; }
          else { w = Math.round((w / h) * maxDim); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.6);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function handlePhotoSelect(orderId: string, file: File) {
    setPhotoFile((prev) => ({ ...prev, [orderId]: file }));
    const url = URL.createObjectURL(file);
    setPhotoPreview((prev) => ({ ...prev, [orderId]: url }));
  }

  function removePhoto(orderId: string) {
    setPhotoFile((prev) => ({ ...prev, [orderId]: null }));
    setPhotoPreview((prev) => ({ ...prev, [orderId]: null }));
  }

  async function uploadPhoto(orderId: string): Promise<string | null> {
    const file = photoFile[orderId];
    if (!file) return null;
    setUploadingPhoto(orderId);
    try {
      const compressed = await compressPhoto(file);
      const fileName = `${orderId}-${Date.now()}.jpg`;
      const r2Key = `packing/${fileName}`;

      const arrayBuf = await compressed.arrayBuffer();
      const body = new Uint8Array(arrayBuf);

      const now = new Date();
      const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const dateStamp = amzDate.slice(0, 8);
      const payloadHash = await (async () => {
        const buf = await crypto.subtle.digest("SHA-256", body);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      })();

      const R2_ACCOUNT_ID = "3ba62fa119ee4f295a5655776bfdb386";
      const R2_ACCESS_KEY = "c48ccbe4d8ccd5f902cf9b9746807ecb";
      const R2_SECRET_KEY = "7e5edf36506903caa3f7efcf179217d8adba3f8d841fee1c6c6ca211f0122911";
      const R2_BUCKET = "mamanay-images";
      const R2_PUBLIC = "https://pub-383108e3bad04ba994957fa1155847a8.r2.dev";

      const canonicalHeaders = `content-type:image/jpeg\nhost:${R2_ACCOUNT_ID}.r2.cloudflarestorage.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}`;
      const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
      const canonicalRequest = `PUT\n/${R2_BUCKET}/${r2Key}\n\n${canonicalHeaders}\n\n${signedHeaders}\n${payloadHash}`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/auto/s3/aws4_request\n${await (async () => {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      })()}`;

      const hmac = async (key: ArrayBuffer | Uint8Array | string, data: string) => {
        const k = typeof key === "string" ? new TextEncoder().encode(key) : key;
        const d = new TextEncoder().encode(data);
        const sig = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const hash = await crypto.subtle.sign("HMAC", sig, d);
        return new Uint8Array(hash);
      };

      const kDate = await hmac(new TextEncoder().encode(`AWS4${R2_SECRET_KEY}`), dateStamp);
      const kRegion = await hmac(kDate, "auto");
      const kService = await hmac(kRegion, "s3");
      const kSigning = await hmac(kService, "aws4_request");
      const signatureArr = await hmac(kSigning, stringToSign);
      const signature = Array.from(signatureArr).map(b => b.toString(16).padStart(2, "0")).join("");
      const auth = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${dateStamp}/auto/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const res = await fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${r2Key}`, {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "image/jpeg",
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": amzDate,
        },
        body,
      });
      if (!res.ok) throw new Error(`R2 upload failed ${res.status}`);

      setUploadingPhoto(null);
      return `${R2_PUBLIC}/${r2Key}`;
    } catch (e) {
      console.error("Upload error:", e);
      alert("Gagal upload foto: " + (e as Error).message);
      setUploadingPhoto(null);
      return null;
    }
  }

  function toggleItemCheck(orderId: string, itemIdx: number) {
    setCheckedItems((prev) => {
      const orderSet = new Set(prev[orderId] || []);
      if (orderSet.has(itemIdx)) orderSet.delete(itemIdx);
      else orderSet.add(itemIdx);
      return { ...prev, [orderId]: orderSet };
    });
  }

  useEffect(() => {
    loadAllOrders();
    loadCustomers();
  }, []);

  useEffect(() => {
    async function loadAllItems() {
      if (allOrders.length === 0) {
        setLoading(false);
        return;
      }
      try {
        const ids = allOrders.map((o) => o.id);
        const { data: items } = await supabase
          .from("order_items")
          .select("order_id, product_name, quantity, price, variant")
          .in("order_id", ids);

        const { data: products } = await supabase
          .from("products")
          .select("name, stock");

        const stockMap: Record<string, number> = {};
        if (products) {
          for (const p of products) {
            stockMap[p.name] = p.stock || 0;
          }
        }

        if (!items) {
          setLoading(false);
          return;
        }
        const map: Record<string, OrderItemData[]> = {};
        for (const row of items) {
          if (!map[row.order_id]) map[row.order_id] = [];
          map[row.order_id].push({
            product_name: row.product_name,
            variant: row.variant,
            quantity: row.quantity,
            price: row.price,
            stock: stockMap[row.product_name] || 0,
          });
        }
        setItemsByOrder(map);
      } catch (e) {
        console.error("loadAllItems error:", e);
      } finally {
        setLoading(false);
      }
    }
    loadAllItems();
  }, [allOrders]);

  useEffect(() => {
    async function loadShipped() {
      const { data: shipped } = await supabase
        .from("orders")
        .select("id, customer_id, status, total, paid_total, notes, created_at, shipped_at, packing_photo, order_type")
        .eq("order_type", "penjualan")
        .eq("fulfillment_status", "shipped")
        .order("shipped_at", { ascending: false, nullsFirst: false });

      if (!shipped) return;

      const ids = shipped.map((o) => o.id);
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity, price, variant")
        .in("order_id", ids);

      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name, phone");

      const customerMapLocal: Record<string, { name: string; phone: string }> = {};
      if (customersData) {
        for (const c of customersData) {
          customerMapLocal[c.id] = { name: c.name, phone: c.phone };
        }
      }

      const map: Record<string, OrderItemData[]> = {};
      if (items) {
        for (const row of items) {
          if (!map[row.order_id]) map[row.order_id] = [];
          map[row.order_id].push({
            product_name: row.product_name,
            variant: row.variant,
            quantity: row.quantity,
            price: row.price,
            stock: 0,
          });
        }
      }

      setShippedOrders(
        shipped.map((o) => ({
          id: o.id,
          customer_id: o.customer_id,
          customer_name: customerMapLocal[o.customer_id]?.name || "Tanpa Nama",
          customer_phone: customerMapLocal[o.customer_id]?.phone || "",
          status: o.status,
          total: o.total,
          paid_total: o.paid_total,
          notes: o.notes,
          qris_notes: o.qris_notes || "",
          created_at: o.created_at,
          shipped_at: o.shipped_at,
          packing_photo: o.packing_photo,
          items: map[o.id] || [],
          isHold: false,
          holdReason: "",
        }))
      );
    }
    loadShipped();
  }, [allOrders]);

  const lunasOrders = allOrders.filter(
    (o) =>
      o.order_type === "penjualan" &&
      isOrderLunas(o) &&
      !["shipped", "diterima", "completed", "cancelled"].includes(o.fulfillment_status)
  );

  const customerMap: Record<string, { name: string; phone: string }> = {};
  for (const c of customers) {
    customerMap[c.id] = { name: c.name, phone: c.phone };
  }

  const grouped: Record<string, ShipmentOrder[]> = {};
  for (const o of lunasOrders) {
    const custId = o.customer_id || "__none__";
    if (!grouped[custId]) grouped[custId] = [];
    const items = itemsByOrder[o.id] || [];
    const hold = isHold(o.notes);
    grouped[custId].push({
      ...o,
      customer_name: customerMap[custId]?.name || "Tanpa Nama",
      customer_phone: customerMap[custId]?.phone || "",
      items,
      isHold: hold,
      holdReason: getHoldReason(o.notes),
    });
  }

  const customerGroups = Object.entries(grouped)
    .map(([custId, orders]) => ({
      custId,
      name: orders[0].customer_name,
      phone: orders[0].customer_phone,
      orders,
      totalItems: orders.reduce(
        (s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0),
        0
      ),
      hasHold: orders.some((o) => o.isHold),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function isWithinDateRange(dateStr: string, range: "all" | "today" | "week" | "month" | "custom"): boolean {
    if (range === "all") return true;
    const d = new Date(dateStr);
    const now = new Date();
    if (range === "today") {
      return d.toDateString() === now.toDateString();
    }
    if (range === "week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    }
    if (range === "month") {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return d >= monthAgo;
    }
    if (range === "custom") {
      return d.toDateString() === new Date(customDate).toDateString();
    }
    return true;
  }

  const shippedGrouped: Record<string, ShipmentOrder[]> = {};
  for (const o of shippedOrders) {
    const dateToCheck = o.shipped_at || o.created_at;
    if (!isWithinDateRange(dateToCheck, dateFilter)) continue;
    const custId = o.customer_id || "__none__";
    if (!shippedGrouped[custId]) shippedGrouped[custId] = [];
    shippedGrouped[custId].push(o);
  }

  const shippedCustomerGroups = Object.entries(shippedGrouped)
    .map(([custId, orders]) => ({
      custId,
      name: orders[0].customer_name,
      phone: orders[0].customer_phone,
      orders,
      totalItems: orders.reduce(
        (s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0),
        0
      ),
      hasHold: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeGroups = filter === "shipped" ? shippedCustomerGroups : customerGroups;

  const filteredGroups = activeGroups.filter((g) => {
    if (filter === "ready" && g.hasHold) return false;
    if (filter === "hold" && !g.hasHold) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchName = g.name.toLowerCase().includes(q);
      const matchItem = g.orders.some((o) =>
        o.items.some((i) => i.product_name.toLowerCase().includes(q))
      );
      const matchId = g.orders.some((o) => shortId(o.id).toLowerCase().includes(q));
      if (!matchName && !matchItem && !matchId) return false;
    }
    return true;
  });

  const holdCount = customerGroups.filter((g) => g.hasHold).length;
  const shippedCount = shippedCustomerGroups.length;

  const filteredOrders = filteredGroups.flatMap((g) => g.orders);
  const totalOrders = filteredOrders.length;
  const totalItems = filteredGroups.reduce((s, g) => s + g.totalItems, 0);
  const filteredHoldCount = filter === "shipped" ? 0 : filteredGroups.filter((g) => g.hasHold).length;
  const filteredReadyCount = filter === "shipped" ? 0 : filteredGroups.length - filteredHoldCount;

  async function toggleHold(order: ShipmentOrder) {
    const newNotes = order.isHold
      ? order.notes.replace(/\[DITUNDA\]\s*.*/, "").trim()
      : `${order.notes ? order.notes + "\n" : ""}[DITUNDA] menunggu stok`;
    await supabase
      .from("orders")
      .update({ notes: newNotes, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    loadAllOrders();
  }

  async function markShipped(orderIds: string[], photoUrl?: string) {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status: "shipped", fulfillment_status: "shipped", shipped_at: now, updated_at: now };
    if (photoUrl) update.packing_photo = photoUrl;
    await supabase
      .from("orders")
      .update(update)
      .in("id", orderIds);
    loadAllOrders();
  }

  function sendWhatsApp(phone: string, customerName: string, orders: ShipmentOrder[]) {
    if (!phone) return;
    let msg = `Halo Kak ${customerName} 👋\n\n`;
    msg += "Kami mau info pesanan Kakak sudah siap dikirim:\n\n";
    for (const o of orders) {
      const itemNames = o.items.map((i) => `${itemLabel(i)} ×${i.quantity}`).join(", ");
      msg += `📦 ${shortId(o.id)}: ${itemNames}\n`;
    }
    msg += `\nKalau sudah oke, kami kirim ya! 🚚`;
    const cleaned = phone.replace(/\D/g, "");
    const wa = cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned.startsWith("62") ? cleaned : "62" + cleaned;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="h-full flex flex-col relative z-10">
      <main className="flex-1 px-4 py-4 max-w-7xl w-full mx-auto overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/orders")}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-800">Kirim Barang</h1>
            <p className="text-sm text-slate-400">Order lunas yang belum dikirim</p>
          </div>
        </div>

        {/* Summary */}
        <div className={`grid gap-2 mb-4 ${filter === "shipped" ? "grid-cols-2" : "grid-cols-3"}`}>
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
            <div className="text-xl font-extrabold text-pink-500">
              {filter === "shipped" ? shippedCustomerGroups.length : customerGroups.length}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Pelanggan</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
            <div className="text-xl font-extrabold text-blue-500">{totalOrders}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Order</div>
          </div>
          {filter !== "shipped" && (
            <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
              <div className="text-xl font-extrabold text-orange-500">{totalItems}</div>
              <div className="text-xs text-slate-400 mt-0.5 font-medium">Item</div>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pelanggan atau item..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
          {([
            ["all", "Semua"],
            ["ready", "Siap Kirim"],
            ["hold", "⏳ Tunda"],
            ["shipped", "🚚 Sudah Kirim"],
          ] as [FilterType, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${
                filter === key
                  ? key === "hold"
                    ? "bg-amber-400 text-amber-900 border-amber-400"
                    : key === "shipped"
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-pink-500 text-white border-pink-500"
                  : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {label} ({key === "hold" ? filteredHoldCount : key === "shipped" ? shippedCount : key === "ready" ? filteredReadyCount : filteredGroups.length})
            </button>
          ))}
        </div>

        {/* Date Filter - only show for shipped */}
        {filter === "shipped" && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              {([
                ["all", "Semua"],
                ["today", "Hari Ini"],
                ["week", "7 Hari"],
                ["month", "1 Bulan"],
                ["custom", "Pilih Tanggal"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDateFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                    dateFilter === key
                      ? "bg-blue-100 text-blue-700 border-blue-200"
                      : "bg-white text-slate-500 border-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {dateFilter === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
            )}
          </div>
        )}

        {/* Customer Groups */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-pink-50 border border-pink-100 rounded-2xl flex items-center justify-center mb-4">
              <Truck className="w-7 h-7 text-pink-300" />
            </div>
            <p className="text-gray-500 font-semibold">
              {filter === "shipped" ? "Belum ada barang terkirim" : "Tidak ada barang perlu dikirim"}
            </p>
            <p className="text-gray-300 text-sm mt-1">
              {filter === "shipped" ? "Barang yang sudah dikirim akan muncul di sini" : "Semua order sudah terkirim"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((group) => (
              <div key={group.custId} className="space-y-2">
                {/* Customer Header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 text-white flex items-center justify-center text-base font-extrabold shrink-0">
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800">{group.name}</div>
                    <div className="text-xs text-slate-400">
                      {group.orders.length} order · {group.totalItems} item
                    </div>
                  </div>
                  {group.hasHold ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Tunda
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-600">
                      ✓ Siap
                    </span>
                  )}
                </div>

                {/* Orders */}
                {group.orders.map((order) => (
                  <div
                    key={order.id}
                    className={`border rounded-xl p-3 ${
                      order.isHold
                        ? "bg-amber-50 border-amber-200"
                        : "bg-white border-slate-100"
                    }`}
                  >
                    {/* Order top */}
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{shortId(order.id)}</span>
                        <span className="text-xs text-slate-400">
                          {new Date(order.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          order.fulfillment_status === "ready"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {order.fulfillment_status === "ready" ? "Ready" : "Dibayar"}
                      </span>
                    </div>

                    {/* Hold badge */}
                    {order.isHold && (
                      <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-amber-100 border border-dashed border-amber-300 rounded-lg text-xs text-amber-700">
                        <Clock className="w-3 h-3" />
                        <span className="font-semibold">Ditunda</span>
                        {order.holdReason && (
                          <span className="text-amber-500">— {order.holdReason}</span>
                        )}
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-1">
                      {order.items.map((item, idx) => {
                        const isChecked = checkedItems[order.id]?.has(idx) || false;
                        return (
                          <div
                            key={idx}
                            onClick={() => toggleItemCheck(order.id, idx)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all cursor-pointer ${
                              isChecked
                                ? "bg-emerald-50 border border-emerald-200"
                                : "bg-slate-50 border border-transparent active:bg-slate-100"
                            }`}
                          >
                            {/* Checkbox */}
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              isChecked
                                ? "bg-emerald-500 border-emerald-500"
                                : "border-slate-300 bg-white"
                            }`}>
                              {isChecked && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span className={`flex-1 font-medium ${
                              isChecked ? "text-emerald-700" : "text-slate-700"
                            }`}>
                              {item.product_name}
                              {(item as any).variant && <span className="text-xs text-purple-500 ml-1">({(item as any).variant})</span>}
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              isChecked
                                ? "bg-emerald-200 text-emerald-700"
                                : "bg-slate-200 text-slate-600"
                            }`}>
                              ×{item.quantity}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Notes */}
                    {order.notes && !order.notes.match(/^\[DITUNDA\]/) && (
                      <div className="mt-2 px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-500 whitespace-pre-wrap">{order.notes.replace(/\[DITUNDA\]\s*.*/, "").trim()}</p>
                      </div>
                    )}
                    {order.qris_notes && (
                      <div className="mt-2 px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-500 whitespace-pre-wrap">{order.qris_notes}</p>
                      </div>
                    )}

                    {/* Photo Upload - only for non-shipped */}
                    {filter !== "shipped" && !order.isHold && (() => {
                      const totalItems = order.items.length;
                      const checked = checkedItems[order.id]?.size || 0;
                      const allChecked = totalItems > 0 && checked === totalItems;
                      if (!allChecked) return null;
                      const preview = photoPreview[order.id];
                      const isUploading = uploadingPhoto === order.id;
                      return (
                        <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            ref={(el) => { fileInputRefs.current[order.id] = el; }}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePhotoSelect(order.id, file);
                            }}
                          />
                          {preview ? (
                            <div className="relative">
                              <img src={preview} alt="Foto packing" className="w-full h-40 object-contain rounded-lg cursor-pointer" onClick={() => setLightboxUrl(preview)} />
                              <p className="text-[10px] text-slate-400 text-center mt-1">Klik foto untuk perbesar</p>
                              <button
                                onClick={() => removePhoto(order.id)}
                                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => fileInputRefs.current[order.id]?.click()}
                              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-pink-400 hover:text-pink-500 transition-all"
                            >
                              <Camera className="w-4 h-4" />
                              <span className="text-xs font-semibold">Foto Packing (Opsional)</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Actions */}
                    {filter !== "shipped" && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => toggleHold(order)}
                          className={`flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                            order.isHold
                              ? "bg-amber-200 text-amber-800 hover:bg-amber-300"
                              : "bg-amber-100 text-amber-600 hover:bg-amber-200"
                          }`}
                        >
                          {order.isHold ? (
                            <><Undo2 className="w-3 h-3" /> Batal Tunda</>
                          ) : (
                            <><Clock className="w-3 h-3" /> Tunda</>
                          )}
                        </button>
                        {!order.isHold && (() => {
                          const totalItems = order.items.length;
                          const checked = checkedItems[order.id]?.size || 0;
                          const allChecked = totalItems > 0 && checked === totalItems;
                          const isUploading = uploadingPhoto === order.id;
                          return (
                            <button
                              onClick={async () => {
                                if (!allChecked) return;
                                let photoUrl: string | null = null;
                                if (photoFile[order.id]) {
                                  photoUrl = await uploadPhoto(order.id);
                                }
                                await markShipped([order.id], photoUrl || undefined);
                              }}
                              disabled={!allChecked || isUploading}
                              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-all ${
                                allChecked && !isUploading
                                  ? "bg-pink-500 text-white hover:bg-pink-600"
                                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
                              }`}
                            >
                              {isUploading ? (
                                <span className="flex items-center gap-1">
                                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  Upload...
                                </span>
                              ) : (
                                <>
                                  <Truck className="w-3 h-3" />
                                  {allChecked ? "Kirim" : `Kirim (${checked}/${totalItems})`}
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </div>
                    )}
                    {filter === "shipped" && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-xs font-semibold text-blue-600">Sudah Terkirim</span>
                          <span className="text-xs text-blue-400 ml-auto">
                            {order.shipped_at
                              ? new Date(order.shipped_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                              : new Date(order.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                            }
                          </span>
                        </div>
                        {order.packing_photo && (
                          <div className="relative">
                            <img src={order.packing_photo} alt="Foto packing" className="w-full h-40 object-contain rounded-lg border border-slate-200 cursor-pointer" onClick={() => setLightboxUrl(order.packing_photo)} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Customer actions */}
                {filter !== "shipped" && (
                  <div className="flex gap-2 ml-13">
                    <button
                      onClick={() =>
                        sendWhatsApp(group.phone, group.name, group.orders.filter((o) => !o.isHold))
                      }
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 transition-all"
                    >
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </button>
                    {group.orders.filter((o) => !o.isHold).length > 0 && (
                      <button
                        onClick={() =>
                          markShipped(group.orders.filter((o) => !o.isHold).map((o) => o.id))
                        }
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-pink-500 text-white hover:bg-pink-600 transition-all"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Kirim Semua
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center cursor-pointer" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Preview" className="max-w-[95%] max-h-[95%] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
