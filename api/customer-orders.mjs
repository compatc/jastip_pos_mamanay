import { getAdmin } from "./pay.mjs";
import { verifyPortalToken } from "./customer-lookup.mjs";

const R2_BASE = "https://pub-383108e3bad04ba994957fa1155847a8.r2.dev";

// r2.dev diblokir ISP Indonesia (Juni 2026) — portal customer dapat URL proxy /img
function imgProxy(u) {
  if (u && u.startsWith(R2_BASE)) return "https://mamanay.vercel.app/img" + u.slice(R2_BASE.length);
  return u;
}

// Rumus tagihan yang sama persis dengan customer.html / payment-confirm.mjs.
function sisaOf(o) {
  return Math.max(0, (o.total || 0) - (o.diskon || 0) - (o.kode_unik || 0) - (o.paid_total || 0));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(body));
}

// Customer menutup pesanan sendiri. Syaratnya sengaja ketat:
// token portal valid, order benar-benar miliknya, status masih 'shipped', dan sudah lunas.
async function confirmReceived(body, res) {
  const customerId = verifyPortalToken(body.portal_token);
  if (!customerId) {
    json(res, 401, { error: "Sesi login tidak valid. Silakan login ulang." });
    return;
  }

  const orderId = String(body.order_id || "").trim();
  if (!orderId) {
    json(res, 400, { error: "order_id wajib diisi" });
    return;
  }

  const sb = await getAdmin();
  const { data: order, error } = await sb
    .from("orders")
    .select("id, customer_id, total, diskon, kode_unik, paid_total, fulfillment_status")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    json(res, 404, { error: "Order tidak ditemukan" });
    return;
  }
  if (order.customer_id !== customerId) {
    json(res, 403, { error: "Order bukan milikmu" });
    return;
  }
  if (order.fulfillment_status !== "shipped") {
    json(res, 409, { error: "Hanya pesanan yang sedang dikirim yang bisa dikonfirmasi" });
    return;
  }
  if (sisaOf(order) > 0) {
    json(res, 409, { error: "Pesanan belum lunas" });
    return;
  }

  const { error: updErr } = await sb
    .from("orders")
    .update({ fulfillment_status: "completed" })
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .eq("fulfillment_status", "shipped");

  if (updErr) {
    json(res, 500, { error: updErr.message });
    return;
  }
  json(res, 200, { ok: true, order_id: orderId, fulfillment_status: "completed" });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await readBody(req);
      if (String(body.action || "") !== "confirm-received") {
        json(res, 400, { error: "action tidak dikenal" });
        return;
      }
      await confirmReceived(body, res);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const customerId = url.searchParams.get("customer_id") || "";

  if (!customerId) {
    json(res, 400, { error: "customer_id required" });
    return;
  }

  try {
    const sb = await getAdmin();
    const { data: orders, error: ordersErr } = await sb
      .from("orders")
      .select(
        "id, created_at, updated_at, total, paid_total, diskon, diskon_manual, kode_unik, status, payment_status, fulfillment_status, notes, qris_notes, packing_photo, courier, resi, shipping_method, shopee_order_no, order_type"
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (ordersErr) {
      json(res, 500, { error: ordersErr.message });
      return;
    }

    const orderIds = (orders || []).map(o => o.id);
    let allItems = [];
    if (orderIds.length > 0) {
      const { data: items } = await sb
        .from("order_items")
        .select("order_id, product_name, product_id, quantity, price, discount, variant")
        .in("order_id", orderIds);
      allItems = items || [];
    }

    const productIds = [...new Set(allItems.map(i => i.product_id).filter(Boolean))];
    let productMap = {};
    if (productIds.length > 0) {
      const { data: prods } = await sb
        .from("products")
        .select("id, image, stock_type")
        .in("id", productIds);
      for (const p of (prods || [])) {
        productMap[p.id] = { image: p.image, stock_type: p.stock_type || null };
      }
    }

    const itemsByOrder = {};
    for (const item of allItems) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      const prod = item.product_id ? productMap[item.product_id] : null;
      itemsByOrder[item.order_id].push({
        ...item,
        image: imgProxy(prod?.image) || null,
        stock_type: prod?.stock_type || null,
      });
    }

    json(res, 200, {
      orders: (orders || []).map((o) =>
        o.packing_photo ? { ...o, packing_photo: imgProxy(o.packing_photo) } : o
      ),
      itemsByOrder,
    });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
