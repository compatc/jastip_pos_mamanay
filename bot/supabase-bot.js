import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BANK_INFO = "BCA 5271330651 a.n. Nurul Azizah";

const PAYMENT_STATUS_LABELS = {
  unpaid: "Belum Bayar",
  dp: "DP",
  paid: "Lunas",
};

const FULFILLMENT_STATUS_LABELS = {
  belum_ready: "Belum Ready",
  ready: "Stok Ready",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export const PAYMENT_LABELS = {
  tf: "Transfer Bank",
  qris: "QRIS",
  split: "Split",
  shopee: "Shopee",
  cash: "Cash",
};

function rupiah(n) {
  return "Rp" + (Number(n) || 0).toLocaleString("id-ID");
}

function phoneEquals(a, b) {
  const na = (a || "").replace(/\D/g, "");
  const nb = (b || "").replace(/\D/g, "");
  const norm = (s) => (s.startsWith("0") ? "62" + s.slice(1) : s);
  return norm(na) === norm(nb) || na === nb;
}

export class BotApi {
  constructor() {
    this.sb = null;
    this.user = null;
  }

  async login(email, password) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("SUPABASE_URL dan SUPABASE_ANON_KEY harus di-set di .env");
    }
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    this.sb = client;
    this.user = client.auth.getUser?.()?.data?.user || null;
  }

  async restoreSession(session) {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await client.auth.setSession(session);
    if (error) throw new Error(error.message);
    this.client = client;
    this.user = client.auth.getUser?.()?.data?.user || null;
  }

  // ————— Cek stok —————

  async searchProducts(keyword) {
    const { data, error } = await this.sb
      .from("products")
      .select("id, name, stock, sell_price, cost_price, unit")
      .ilike("name", `%${keyword}%`)
      .order("name");
    if (error) throw new Error(error.message);
    return data;
  }

  formatStock(products) {
    if (!products || products.length === 0) return "Produk tidak ditemukan.";
    return products
      .map(
        (p) =>
          `📦 ${p.name}\n   Stok: ${p.stock || 0} ${p.unit || ""}\n   Harga: ${rupiah(p.sell_price)}`
      )
      .join("\n\n");
  }

  // ————— Cari pelanggan —————

  async searchCustomers(keyword) {
    const { data, error } = await this.sb
      .from("customers")
      .select("id, name, phone")
      .or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`)
      .order("name");
    if (error) throw new Error(error.message);
    return data || [];
  }

  formatCustomers(customers) {
    if (!customers || customers.length === 0) return "Pelanggan tidak ditemukan.";
    return customers
      .map((c) => `👤 ${c.name}\n   Telp: ${c.phone || "-"}`)
      .join("\n\n");
  }

  // ————— Tambah pelanggan —————

  async addCustomer({ name, phone }) {
    const { data, error } = await this.sb
      .from("customers")
      .insert({ id: randomUUID(), name, phone, address: "", category: "pelanggan", created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  // ————— Buat order —————

  async createOrder({
    orderType = "penjualan",
    paymentType = "cash",
    contactName = "",
    contactPhone = "",
    items = [],
    paidTotal = 0,
    ongkir = 0,
    diskon = 0,
    notes = "",
    accountId = null,
  }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Item order tidak boleh kosong");
    }
    const now = new Date().toISOString();
    const orderId = randomUUID();
    const subtotal = items.reduce(
      (sum, i) => sum + i.price * i.quantity - (i.discount || 0),
      0
    );
    const total = subtotal - (diskon || 0) + (ongkir || 0);
    const initialStatus = total <= (paidTotal || 0) ? "paid" : "new";

    const nameQ = contactName.trim();
    const phoneQ = contactPhone.trim();

    let customerId = "";
    let customerName = nameQ;
    if (nameQ || phoneQ) {
      if (phoneQ) {
        const { data: all } = await this.sb
          .from("customers")
          .select("id, name, phone");
        const found = (all || []).find((c) => phoneEquals(c.phone, phoneQ));
        if (found) {
          customerId = found.id;
          customerName = found.name;
        }
      }

      if (!customerId && nameQ) {
        const { data: existing } = await this.sb
          .from("customers")
          .select("id, name")
          .ilike("name", nameQ)
          .limit(1)
          .maybeSingle();
        if (existing) {
          customerId = existing.id;
          customerName = existing.name;
        }
      }

      if (!customerId) {
        customerId = randomUUID();
        const { error: cErr } = await this.sb.from("customers").insert({
          id: customerId,
          name: nameQ,
          phone: phoneQ,
          address: "",
          category: "pelanggan",
          created_at: now,
        });
        if (cErr) throw new Error("Gagal membuat pelanggan: " + cErr.message);
      }
    }

    const { error: orderError } = await this.sb.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      status: initialStatus,
      payment_status: (paidTotal || 0) >= total ? "paid" : (paidTotal || 0) > 0 ? "dp" : "unpaid",
      fulfillment_status: initialStatus === "paid" || initialStatus === "ready" ? "ready" : "belum_ready",
      total,
      paid_total: paidTotal || 0,
      diskon: diskon || 0,
      order_type: orderType,
      payment_type: paymentType,
      ongkir: ongkir || 0,
      notes: notes || "",
      account_id: accountId || null,
      created_at: now,
      updated_at: now,
    });
    if (orderError) throw new Error("Gagal membuat order: " + orderError.message);

    for (const item of items) {
      let product = null;
      if (item.product_id) {
        const { data } = await this.sb
          .from("products")
          .select("id, stock, unit")
          .eq("id", item.product_id)
          .maybeSingle();
        product = data;
      }
      if (!product) {
        const { data } = await this.sb
          .from("products")
          .select("id, stock, unit")
          .ilike("name", item.product_name)
          .limit(1)
          .maybeSingle();
        product = data;
      }
      if (!product) {
        const newId = randomUUID();
        const initialStock = orderType === "penjualan" ? item.quantity : 0;
        const { error: pErr } = await this.sb.from("products").insert({
          id: newId,
          name: item.product_name,
          cost_price: item.cost_price || 0,
          sell_price: item.price,
          stock: initialStock,
          unit: "",
          created_at: now,
        });
        if (pErr) throw new Error("Gagal membuat produk: " + pErr.message);
        product = { id: newId, stock: initialStock, unit: "" };
      }

      const itemId = randomUUID();
      const { error: itemErr } = await this.sb.from("order_items").insert({
        id: itemId,
        order_id: orderId,
        product_id: product.id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        discount: item.discount || 0,
        paid_value: 0,
        status: "new",
      });
      if (itemErr) throw new Error("Gagal membuat item: " + itemErr.message);

      if (orderType === "penjualan") {
        const newStock = (product.stock || 0) - item.quantity;
        await this.sb.from("products").update({ stock: newStock }).eq("id", product.id);
        await this.sb.from("stock_movements").insert({
          id: randomUUID(),
          product_id: product.id,
          order_id: orderId,
          type: "keluar",
          quantity: item.quantity,
          notes: `Order #${orderId.slice(0, 6)}`,
          created_at: now,
        });
      }
    }

    return { orderId, total, status: initialStatus, customerId };
  }

  // ————— Cek status order —————

  async getCustomerOrders(customerId) {
    const { data, error } = await this.sb
      .from("orders")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async getOrderWithItems(orderId) {
    const { data: order, error } = await this.sb
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return null;
    const { data: items } = await this.sb
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    return { ...order, items: items || [] };
  }

  formatOrderStatus(order) {
    if (!order) return "Order tidak ditemukan.";
    const items = (order.items || [])
      .map((i) => `  • ${i.product_name} x${i.quantity} = ${rupiah(i.price * i.quantity - (i.discount || 0))}`)
      .join("\n");
    const sisa = order.total - order.paid_total;
    const ps = PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status;
    const fs = FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status;
    return [
      `📦 Order: ${order.id.slice(0, 8)}`,
      `Bayar: ${ps}`,
      `Kirim: ${fs}`,
      `Pelanggan: ${order.customer_name || "-"}`,
      `Tipe: ${order.order_type === "penjualan" ? "Penjualan" : "Pembelian"}`,
      `Item:\n${items}`,
      `Total: ${rupiah(order.total)}`,
      `Dibayar: ${rupiah(order.paid_total)}`,
      sisa > 0 ? `Sisa: ${rupiah(sisa)}` : "Status: LUNAS",
    ].join("\n");
  }

  // ————— Invoice —————

  async getOrdersWithItems(customerId) {
    const { data: orders, error } = await this.sb
      .from("orders")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    for (const order of orders || []) {
      const { data: items } = await this.sb
        .from("order_items")
        .select("*")
        .eq("order_id", order.id);
      order.items = items || [];
    }
    return orders;
  }

  buildInvoiceMsg(customerName, orders) {
    const deadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const deadlineStr = deadline.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let msg = `Halo Kak ${customerName} 🙏\n\n`;
    msg += "Terima kasih sudah berbelanja di *Jastip_mamanay*.\n\n";
    msg += "Berikut kami kirimkan invoice untuk pesanan Kakak:\n\n";

    let grandTotal = 0;
    let grandPaid = 0;

    for (const order of orders) {
      const productNames = (order.items || [])
        .map((i) => `${i.product_name} x${i.quantity}`)
        .join(", ");
      const statusLabel = FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status;
      msg += `📦 Pesanan: ${productNames}\n`;
      msg += `Status barang: ${statusLabel}\n`;
      msg += `Total: ${rupiah(order.total)}\n`;
      if ((order.paid_total || 0) > 0) {
        msg += `Sudah dibayar: ${rupiah(order.paid_total)}\n`;
      }
      const sisa = order.total - (order.paid_total || 0);
      if (sisa > 0) {
        msg += `Sisa tagihan: ${rupiah(sisa)}\n`;
      }
      msg += "\n";
      grandTotal += order.total;
      grandPaid += order.paid_total || 0;
    }

    const grandSisa = grandTotal - grandPaid;
    if (orders.length > 1) {
      msg += `💰 *Total semua: ${rupiah(grandTotal)}*\n`;
      if (grandPaid > 0) msg += `Sudah dibayar: ${rupiah(grandPaid)}\n`;
      if (grandSisa > 0) msg += `Sisa tagihan: *${rupiah(grandSisa)}*\n`;
      msg += "\n";
    }

    if (grandSisa > 0) {
      msg += `🏦 Transfer ke:\n*${BANK_INFO}*\n\n`;
      msg += `⏰ Mohon bayar sebelum:\n*${deadlineStr}*\n\n`;
      msg += "Setelah transfer, silakan kirim bukti pembayaran ya Kak.\n";
    } else {
      msg += "✅ Lunas! Menunggu persediaan barang.\n";
    }

    return msg;
  }

  async buildInvoiceForCustomer(customerId) {
    const { data: customer, error: cErr } = await this.sb
      .from("customers")
      .select("id, name, phone")
      .eq("id", customerId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!customer) return null;

    const orders = await this.getOrdersWithItems(customerId);
    if (orders.length === 0) return null;

    const activeOrders = orders.filter((o) => !["shipped", "completed", "cancelled"].includes(o.fulfillment_status));
    if (activeOrders.length === 0) return null;

    return {
      customer,
      orders: activeOrders,
      msg: this.buildInvoiceMsg(customer.name, activeOrders),
    };
  }

  async getAllInvoiceTargets() {
    const { data: orders, error } = await this.sb
      .from("orders")
      .select("customer_id")
      .not("fulfillment_status", "in", "(shipped,completed,cancelled)");
    if (error) throw new Error(error.message);

    const customerIds = [...new Set((orders || []).map((o) => o.customer_id).filter(Boolean))];
    if (customerIds.length === 0) return [];

    const { data: customers, error: cErr } = await this.sb
      .from("customers")
      .select("id, name, phone")
      .in("id", customerIds);
    if (cErr) throw new Error(cErr.message);

    return customers || [];
  }
}

// ————— Perintah teks untuk bot WhatsApp (handler sederhana) —————

async function handleGroupOrder(api, text) {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return "Format:\npesan NamaPelanggan 08123456789\n2 rak sepatu\n1 blindbox stitch";
  }

  const firstLine = lines[0].replace(/^\/?pesan\s*/i, "").trim();
  const parts = firstLine.split(/\s+/);
  const contactName = parts[0] || "";
  const contactPhone = parts.find((p) => /^\d{10,13}$/.test(p)) || "";
  if (!contactName) {
    return "Nama pelanggan wajib diisi.\nFormat: pesan Nama 08123456789";
  }

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/^[-•*]\s*/, "");
    const m = line.match(/^(\d+)\s*(?:x|pcs|pc|bij)?\s+(.+)/i);
    if (!m) continue;
    const qty = parseInt(m[1], 10);
    const productName = m[2].trim();
    if (qty > 0 && productName) {
      items.push({ quantity: qty, product_name: productName });
    }
  }

  if (items.length === 0) {
    return "Tidak ada item yang dikenali.\nFormat: 2 rak sepatu plastik";
  }

  const resolvedItems = [];
  const notFound = [];
  for (const item of items) {
    const products = await api.searchProducts(item.product_name);
    if (products.length === 0) {
      notFound.push(item.product_name);
      continue;
    }
    const p = products[0];
    resolvedItems.push({
      product_id: p.id,
      product_name: p.name,
      quantity: item.quantity,
      price: p.sell_price || 0,
    });
  }

  if (notFound.length > 0) {
    return "Produk tidak ditemukan: " + notFound.join(", ") + "\nCek stok: stok <nama>";
  }

  try {
    const result = await api.createOrder({
      orderType: "penjualan",
      paymentType: "cash",
      contactName,
      contactPhone,
      items: resolvedItems,
      notes: "Order dari WhatsApp group",
    });

    const adminPhone = "6285894652806";
    let adminMsg = "🛒 *Order dari Group*\n\n";
    adminMsg += "👤 Pelanggan: *" + contactName + "*\n";
    if (contactPhone) adminMsg += "📱 Telp: " + contactPhone + "\n";
    adminMsg += "📦 Order: *#" + result.orderId.slice(0, 6) + "*\n\n";
    for (const i of resolvedItems) {
      adminMsg += "• " + i.quantity + "× " + i.product_name + " — Rp " + (i.price * i.quantity).toLocaleString("id-ID") + "\n";
    }
    const total = resolvedItems.reduce((s, i) => s + i.price * i.quantity, 0);
    adminMsg += "\n💰 Total: Rp " + total.toLocaleString("id-ID") + "\n";
    adminMsg += "Status: Belum dibayar\n\n";
    adminMsg += "Link: https://mamanay.vercel.app/orders/" + result.orderId;
    try {
      const { data: settings } = await api.sb.from("settings").select("value").eq("key", "bot_api_url").maybeSingle();
      const botApiUrl = settings?.value || "https://hardship-broadly-mammogram.ngrok-free.dev";
      await fetch(botApiUrl + "/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: adminPhone, message: adminMsg }),
      });
    } catch (_) {}

    let reply = "✅ Order berhasil!\n";
    reply += "👤 " + contactName + "\n";
    reply += "📦 #" + result.orderId.slice(0, 6) + "\n\n";
    for (const i of resolvedItems) {
      reply += "• " + i.quantity + "× " + i.product_name + " — Rp " + (i.price * i.quantity).toLocaleString("id-ID") + "\n";
    }
    reply += "\n💰 Total: Rp " + total.toLocaleString("id-ID") + "\n";
    reply += "Status: Belum dibayar";
    return reply;
  } catch (e) {
    return "Gagal membuat order: " + e.message;
  }
}

export async function handleBotMessage(api, senderNumber, text) {
  const msg = (text || "").trim().toLowerCase();
  const [cmd, ...rest] = msg.split(/\s+/);
  const arg = rest.join(" ").trim();

  if (cmd === "stok" || cmd === "/stok") {
    const products = await api.searchProducts(arg);
    return api.formatStock(products);
  }

  if (cmd === "cari" || cmd === "/cari") {
    const customers = await api.searchCustomers(arg);
    return api.formatCustomers(customers);
  }

  if (cmd === "order" || cmd === "cekorder") {
    const customers = await api.searchCustomers(arg);
    if (customers.length === 0) return "Pelanggan tidak ditemukan.";
    const orders = await api.getCustomerOrders(customers[0].id);
    if (orders.length === 0) return "Belum ada order untuk pelanggan ini.";
    const latest = orders[0];
    const full = await api.getOrderWithItems(latest.id);
    return api.formatOrderStatus(full);
  }

  if (cmd === "kiriminvoice") {
    if (!arg) return "Format: kiriminvoice <nama pelanggan>";
    const customers = await api.searchCustomers(arg);
    if (customers.length === 0) return "Pelanggan tidak ditemukan.";
    const target = await api.buildInvoiceForCustomer(customers[0].id);
    if (!target) return "Tidak ada invoice aktif untuk pelanggan ini (semua order sudah dikirim/selesai).";
    return JSON.stringify({ action: "send_invoice", phone: target.customer.phone, msg: target.msg, customerName: target.customer.name });
  }

  if (cmd === "kirimsemua") {
    const targets = await api.getAllInvoiceTargets();
    if (targets.length === 0) return "Tidak ada pelanggan yang perlu dikirim invoice.";
    const results = [];
    for (const c of targets) {
      const invoice = await api.buildInvoiceForCustomer(c.id);
      if (invoice) {
        results.push({ phone: c.phone, name: c.name, msg: invoice.msg });
      }
    }
    if (results.length === 0) return "Tidak ada invoice yang perlu dikirim.";
    return JSON.stringify({ action: "send_batch", count: results.length, invoices: results });
  }

  if (cmd === "bantuan" || cmd === "help") {
    return [
      "Perintah yang tersedia:",
      "• stok <kata> — cek stok produk",
      "• cari <nama/telepon> — cari pelanggan",
      "• order <nama/telepon> — cek order terbaru pelanggan",
      "• kiriminvoice <nama> — kirim invoice ke pelanggan",
      "• kirimsemua — kirim invoice ke semua pelanggan aktif",
      "• pesan — buat order dari group (lihat format di bawah)",
      "",
      "Format order dari group:",
      "pesan NamaPelanggan 08123456789",
      "2 rak sepatu plastik",
      "1 blindbox stitch",
    ].join("\n");
  }

  if (cmd === "pesan" || cmd === "/pesan") {
    return await handleGroupOrder(api, text);
  }

  return "Perintah tidak dikenali. Ketik: bantuan";
}
