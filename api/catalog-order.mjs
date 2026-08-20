import { getAdmin } from "./pay.mjs";
import { randomUUID } from "node:crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

  try {
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

    const sb = await getAdmin();

    // Get authenticated user_id for RLS
    const { data: { user } } = await sb.auth.getUser();
    const userId = user?.id || "";

    // Normalize phone — strip all non-digits, ensure starts with 62
    let digits = phone.replace(/\D/g, "");
    if (digits.startsWith("0")) {
      digits = "62" + digits.slice(1);
    }
    if (!digits.startsWith("62")) {
      digits = "62" + digits;
    }

    // Build search variants: 628xxx, 08xxx, and raw with +/spaces/dashes
    const variants = [digits];
    if (digits.startsWith("628")) {
      variants.push("0" + digits.slice(2)); // 08xxx
    }
    // Also try with + prefix and common separators for old DB records
    const withPlus = "+" + digits;
    variants.push(withPlus);
    // Try with spaces/dashes: +62 8xx-xxxx-xxxx
    if (digits.length > 10) {
      const core = digits.slice(2);
      variants.push("+62 " + core.slice(0, 3) + "-" + core.slice(3, 7) + "-" + core.slice(7));
      variants.push("+62" + core);
    }

    // Find or create customer
    let customerId = null;
    const orConditions = variants.map((v) => `phone.eq.${v}`).join(",");
    const { data: existing } = await sb
      .from("customers")
      .select("id")
      .or(orConditions)
      .limit(1)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
      // Update address if customer exists but has no address
      if (address?.trim()) {
        await sb.from("customers").update({ address: address.trim() }).eq("id", customerId);
      }
    } else {
      customerId = randomUUID();
      const { error: custErr } = await sb.from("customers").insert({
        id: customerId,
        name: customer_name.trim(),
        phone: digits,
        address: address?.trim() || "",
        category: "pelanggan",
        created_at: new Date().toISOString(),
      });
      if (custErr) {
        console.error("catalog-order customer error:", custErr);
      }
    }

    // Validate products & calculate total
    let total = 0;
    const validatedItems = [];
    for (const item of items) {
      const { data: product } = await sb
        .from("products")
        .select("id, name, sell_price, stock, unit")
        .eq("id", item.product_id)
        .single();

      if (!product) {
        json(res, 400, { error: `Produk tidak ditemukan: ${item.product_id}` });
        return;
      }
      const qty = parseInt(item.quantity) || 0;
      if (qty <= 0) {
        json(res, 400, { error: `Qty harus > 0: ${product.name}` });
        return;
      }
      if (product.stock < qty) {
        json(res, 400, { error: `Stok ${product.name} tidak cukup (sisa ${product.stock})` });
        return;
      }
      const price = product.sell_price;
      total += price * qty;
      validatedItems.push({ ...product, qty, price });
    }

    // Create order
    const orderId = randomUUID();
    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const { error: orderErr } = await sb.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      user_id: userId,
      status: "new",
      payment_status: "unpaid",
      fulfillment_status: "belum_ready",
      total,
      paid_total: 0,
      diskon: 0,
      order_type: "penjualan",
      payment_type: "tf",
      ongkir: 0,
      notes: notes?.trim() || "",
      qris_notes: "",
      account_id: null,
      created_at: now,
      updated_at: now,
    });
    if (orderErr) {
      console.error("catalog-order order error:", orderErr);
      json(res, 500, { error: "Gagal membuat order: " + orderErr.message });
      return;
    }

    // Create order_items + stock_movements
    for (const item of validatedItems) {
      const itemId = randomUUID();
      await sb.from("order_items").insert({
        id: itemId,
        order_id: orderId,
        product_id: item.id,
        product_name: item.name,
        price: item.price,
        quantity: item.qty,
        discount: 0,
        paid_value: 0,
        status: "new",
      });

      // Reduce stock
      const newStock = item.stock - item.qty;
      await sb.from("products").update({ stock: newStock }).eq("id", item.id);

      // Stock movement
      const { data: lastMov } = await sb
        .from("stock_movements")
        .select("invoice_no")
        .order("invoice_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextInvoice = ((lastMov?.invoice_no) || 0) + 1;

      await sb.from("stock_movements").insert({
        id: randomUUID(),
        product_id: item.id,
        order_id: orderId,
        date: today,
        transaction_type: "Penjualan",
        invoice_no: nextInvoice,
        party_name: customer_name.trim(),
        qty: -item.qty,
        qty_after: newStock,
        unit: item.unit || "PCS",
        created_at: now,
      });
    }

    // Send WA notification to admin
    try {
      const { data: settings } = await sb.from("settings").select("value").eq("key", "bot_api_url").maybeSingle();
      const botApiUrl = settings?.value || "https://hardship-broadly-mammogram.ngrok-free.dev";
      const adminPhone = "6285894652806";

      const itemList = validatedItems.map((it) => `  ${it.name} x${it.qty} = Rp ${(it.price * it.qty).toLocaleString("id-ID")}`).join("\n");
      let waMsg = "🛒 *Order Baru dari Katalog*\n\n";
      waMsg += "👤 *" + customer_name.trim() + "*\n";
      waMsg += "📱 " + custPhone.trim() + "\n";
      if (address?.trim()) waMsg += "📍 " + address.trim() + "\n";
      if (notes?.trim()) waMsg += "📝 " + notes.trim() + "\n";
      waMsg += "\n📦 *Detail:*\n" + itemList + "\n";
      waMsg += "\n💰 *Total: Rp " + total.toLocaleString("id-ID") + "*\n";
      waMsg += "📋 Status: Baru\n\n";
      waMsg += "───────────\n";
      waMsg += "Link: https://mamanay.vercel.app/orders/" + orderId;

      await fetch(botApiUrl + "/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (process.env.BOT_API_TOKEN || "mamanay2026") },
        body: JSON.stringify({ phone: adminPhone, message: waMsg }),
      });

      // Send confirmation WA to customer
      const custDigits = custPhone.replace(/\D/g, "");
      const custWa = custDigits.startsWith("0") ? "62" + custDigits.slice(1) : custDigits.startsWith("62") ? custDigits : "62" + custDigits;
      let custMsg = "Halo *" + customer_name.trim() + "* 👋\n\n";
      custMsg += "Terima kasih sudah order di *jastip_mamanay*!\n\n";
      custMsg += "📋 *Ringkasan Pesanan:*\n";
      custMsg += "───────────\n";
      custMsg += itemList + "\n";
      custMsg += "───────────\n";
      custMsg += "💰 *Grand Total: Rp " + total.toLocaleString("id-ID") + "*\n\n";
      custMsg += "📦 Status: *Baru* (menunggu konfirmasi)\n\n";
      custMsg += "Jika ada pertanyaan, balas pesan ini ya 😊";

      await fetch(botApiUrl + "/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (process.env.BOT_API_TOKEN || "mamanay2026") },
        body: JSON.stringify({ phone: custWa, message: custMsg }),
      });
    } catch (e) {
      console.error("catalog-order WA error:", e.message);
    }

    json(res, 200, { ok: true, order_id: orderId });
  } catch (e) {
    console.error("catalog-order error:", e);
    json(res, 500, { error: e.message });
  }
}
