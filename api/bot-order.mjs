import { getAdmin } from "./pay.mjs";
import { randomUUID } from "node:crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== "Bearer mamanay2026") {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  try {
    const sb = await getAdmin();
    const { items, customer_name, phone, notes, payment_type, paid_total, order_type } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      json(res, 400, { error: "items wajib diisi" });
      return;
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal += (item.price || 0) * (item.quantity || 1);
    }

    const orderId = randomUUID();
    const now = new Date().toISOString();

    // Find or create customer
    let customerId = null;
    if (customer_name && phone) {
      const { data: existing } = await sb
        .from("customers")
        .select("id")
        .or(`phone.ilike.%${phone}%`)
        .limit(1);

      if (existing && existing.length > 0) {
        customerId = existing[0].id;
      } else {
        customerId = randomUUID();
        const { error: cErr } = await sb.from("customers").insert({
          id: customerId,
          name: customer_name,
          phone: phone,
          address: "",
          category: "pelanggan",
          points: 0,
          total_spent: 0,
          member_level: "silver",
          created_at: now,
        });
        if (cErr) console.error("Create customer error:", cErr.message);
      }
    }

    const { error: orderErr } = await sb.from("orders").insert({
      id: orderId,
      customer_id: customerId || "",
      status: "new",
      payment_status: paid_total >= subtotal ? "paid" : "unpaid",
      fulfillment_status: "belum_ready",
      total: subtotal,
      paid_total: paid_total || 0,
      refund_total: 0,
      diskon: 0,
      order_type: order_type || "penjualan",
      payment_type: payment_type || "qris",
      ongkir: 0,
      notes: notes || "",
      qris_notes: "",
      account_id: null,
      created_at: now,
      updated_at: now,
    });
    if (orderErr) {
      json(res, 500, { error: "Gagal buat order: " + orderErr.message });
      return;
    }

    for (const item of items) {
      const { error: iErr } = await sb.from("order_items").insert({
        id: randomUUID(),
        order_id: orderId,
        product_id: item.product_id || null,
        product_name: item.product_name || item.name || "Produk",
        price: item.price || 0,
        quantity: item.quantity || 1,
        discount: 0,
        paid_value: 0,
        status: "new",
        variant: item.variant || null,
      });
      if (iErr) console.error("Order item insert error:", iErr.message);
    }

    console.log("bot-order ok:", orderId, "total:", subtotal);
    json(res, 200, { ok: true, orderId, total: subtotal });
  } catch (e) {
    console.error("bot-order error:", e.message);
    json(res, 500, { error: e.message });
  }
}
