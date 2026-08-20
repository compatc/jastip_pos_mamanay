import { getAdmin } from "./pay.mjs";
import { randomUUID } from "node:crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const sb = await getAdmin();

    if (req.method === "GET") {
      res.setHeader("Cache-Control", "public, max-age=60");
      const { data, error } = await sb
        .from("products")
        .select("id, name, sell_price, stock, unit, image")
        .order("name", { ascending: true });
      if (error) {
        json(res, 500, { error: error.message });
        return;
      }
      json(res, 200, { ok: true, data: data || [] });
      return;
    }

    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }

    const { items, customer_name, phone, address, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      json(res, 400, { error: "items wajib diisi" });
      return;
    }
    if (!customer_name || !customer_name.trim()) {
      json(res, 400, { error: "Nama wajib diisi" });
      return;
    }
    if (!phone || !phone.trim()) {
      json(res, 400, { error: "No. WhatsApp wajib diisi" });
      return;
    }

    const { data: existingCustomers, error: searchErr } = await sb
      .from("customers")
      .select("id, name, phone")
      .or(`name.ilike.%${customer_name.trim()}%,phone.ilike.%${phone.trim()}%`)
      .limit(5);

    if (searchErr) {
      json(res, 500, { error: searchErr.message });
      return;
    }

    let customerId = "";
    let customerDbName = customer_name.trim();
    const normalizedPhone = phone.trim().replace(/\D/g, "");
    const matched = (existingCustomers || []).find((c) => {
      const cp = (c.phone || "").replace(/\D/g, "");
      return cp === normalizedPhone || cp.endsWith(normalizedPhone) || normalizedPhone.endsWith(cp);
    });

    if (matched) {
      customerId = matched.id;
      customerDbName = matched.name;
    } else {
      customerId = randomUUID();
      const { error: cErr } = await sb.from("customers").insert({
        id: customerId,
        name: customer_name.trim(),
        phone: phone.trim(),
        address: address || "",
        category: "pelanggan",
        created_at: new Date().toISOString(),
      });
      if (cErr) {
        json(res, 500, { error: "Gagal buat pelanggan: " + cErr.message });
        return;
      }
    }

    const orderId = randomUUID();
    const now = new Date().toISOString();
    let subtotal = 0;
    for (const item of items) {
      subtotal += (item.price || 0) * (item.quantity || 1);
    }

    const { error: orderErr } = await sb.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      status: "new",
      total: subtotal,
      paid_total: 0,
      order_type: "penjualan",
      payment_type: "qris",
      ongkir: 0,
      notes: notes || "",
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
      });
      if (iErr) {
        console.error("catalog-order item insert error:", iErr.message);
      }
    }

    const adminPhone = process.env.ADMIN_PHONE || process.env.VITE_ADMIN_PHONE || "6285894652806";
    let botUrl = process.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
    try {
      const { data: settings } = await sb.from("settings").select("value").eq("key", "bot_api_url").maybeSingle();
      if (settings?.value) botUrl = settings.value;
    } catch (_) {}

    const itemList = items.map((i) => `• ${i.product_name || i.name} x${i.quantity || 1} = Rp ${((i.price || 0) * (i.quantity || 1)).toLocaleString("id-ID")}`).join("\n");
    let waMsg = "🛒 *Order dari Catalog*\n\n";
    waMsg += "👤 " + customer_name.trim() + "\n";
    waMsg += "📱 " + phone.trim() + "\n";
    if (address?.trim()) waMsg += "📍 " + address.trim() + "\n";
    if (notes?.trim()) waMsg += "📝 " + notes.trim() + "\n";
    waMsg += "\n📦 *Detail:*\n" + itemList + "\n";
    waMsg += "\n💰 *Total: Rp " + subtotal.toLocaleString("id-ID") + "*\n";
    waMsg += "📋 Status: Baru\n\n";
    waMsg += "───────────\n";
    waMsg += "Link: https://mamanay.vercel.app/orders/" + orderId;

    await fetch(botUrl + "/api/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (process.env.BOT_API_TOKEN || "mamanay2026") },
      body: JSON.stringify({ phone: adminPhone, message: waMsg }),
    });

    const custDigits = phone.trim().replace(/\D/g, "");
    const custWa = custDigits.startsWith("0") ? "62" + custDigits.slice(1) : custDigits.startsWith("62") ? custDigits : "62" + custDigits;
    let custMsg = "Halo *" + customer_name.trim() + "* 👋\n\n";
    custMsg += "Terima kasih sudah order di *jastip_mamanay*!\n\n";
    custMsg += "📋 *Ringkasan Pesanan:*\n";
    custMsg += "───────────\n";
    custMsg += itemList + "\n";
    custMsg += "───────────\n";
    custMsg += "💰 *Grand Total: Rp " + subtotal.toLocaleString("id-ID") + "*\n\n";
    custMsg += "📦 Status: *Baru* (menunggu konfirmasi)\n\n";
    custMsg += "Jika ada pertanyaan, balas pesan ini ya 😊";

    await fetch(botUrl + "/api/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (process.env.BOT_API_TOKEN || "mamanay2026") },
      body: JSON.stringify({ phone: custWa, message: custMsg }),
    });

    json(res, 200, { ok: true, orderId, total: subtotal, customerName: customerDbName });
  } catch (e) {
    console.error("catalog-order error:", e.message);
    json(res, 500, { error: e.message });
  }
}
