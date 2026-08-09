import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BANK_INFO = "BCA 5271330651 a.n. Nurul Azizah";

const STATUS_LABELS = {
  new: "Baru",
  "belum-ready": "Belum Ready",
  ready: "Ready",
  paid: "Dibayar",
  shipped: "Dikirim",
  delivered: "Diterima",
  completed: "Selesai",
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

function digits(s) {
  return (s || "").replace(/\D/g, "");
}

function phoneEquals(a, b) {
  const da = digits(a);
  const db = digits(b);
  if (!da || !db) return false;
  const norm = (d) => {
    if (d.startsWith("62")) d = d.slice(2);
    if (d.startsWith("0")) d = d.slice(1);
    return d;
  };
  return norm(da) === norm(db);
}

/**
 * Client Supabase untuk bot.
 * Login dengan email/password akun yang sama dengan aplikasi,
 * semua akses data mengikuti aturan RLS (hanya data milik akun itu).
 */
export class BotApi {
  constructor({ url = SUPABASE_URL, anonKey = SUPABASE_ANON_KEY } = {}) {
    if (!url || !anonKey) {
      throw new Error(
        "SUPABASE_URL dan SUPABASE_ANON_KEY wajib diisi (cek .env)"
      );
    }
    this.url = url;
    this.anonKey = anonKey;
    this.client = null;
    this.user = null;
  }

  get sb() {
    if (!this.client) throw new Error("Belum login. Panggil login() dulu.");
    return this.client;
  }

  async login(email, password) {
    const client = createClient(this.url, this.anonKey);
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    this.client = client;
    this.user = data.user;
    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || "",
      session: data.session,
    };
  }

  async restoreSession(session) {
    const client = createClient(this.url, this.anonKey);
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
    if (!products || products.length === 0) {
      return "Produk tidak ditemukan.";
    }
    const lines = products.map(
      (p) =>
        `• ${p.name}\n  Stok: ${p.stock} ${p.unit || ""} | Harga: ${rupiah(
          p.sell_price
        )}`
    );
    return lines.join("\n");
  }

  // ————— Pelanggan —————

  async searchCustomers(keyword) {
    const { data, error } = await this.sb
      .from("customers")
      .select("id, name, phone, address, category")
      .or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`)
      .order("name");
    if (error) throw new Error(error.message);
    return data;
  }

  async addCustomer({ name, phone = "", address = "", category = "pelanggan" }) {
    if (!name || !name.trim()) throw new Error("Nama wajib diisi");
    const { data, error } = await this.sb
      .from("customers")
      .insert({
        id: randomUUID(),
        name: name.trim(),
        phone,
        address,
        category,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  formatCustomers(customers) {
    if (!customers || customers.length === 0) {
      return "Pelanggan tidak ditemukan.";
    }
    return customers
      .map(
        (c) =>
          `• ${c.name}${c.phone ? ` (${c.phone})` : ""} [${c.category}]`
      )
      .join("\n");
  }

  // ————— Order —————

  /**
   * Buat order baru. items: [{ product_id?, product_name, price, quantity, discount, cost_price?, unit? }]
   * Pelanggan dicocokkan: (1) by nomor telepon, (2) by nama. Jika sudah ada,
   * dipakai pelanggan lama — baru dibuat pelanggan baru kalau tidak ketemu.
   * Produk: cocokkan by product_id lalu by nama; kalau belum ada di inventaris,
   * produk baru dibuat otomatis (harga jual = price, stok awal = qty untuk
   * penjualan) lalu stok disesuaikan dan dicatat di stock_movements.
   */
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
      // 1) Cocokkan by nomor telepon (normalisasi 0/62/+62)
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

      // 2) Kalau tidak ketemu by telepon, cocokkan by nama
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

      // 3) Benar-benar baru -> buat pelanggan baru
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
      // 1) Resolve produk: by product_id -> by nama -> buat baru otomatis
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
          unit: item.unit || "PCS",
          image: "",
          created_at: now,
        });
        if (pErr) throw new Error("Gagal membuat produk: " + pErr.message);
        product = { id: newId, stock: initialStock, unit: item.unit || "PCS" };
      }

      const { error: iErr } = await this.sb.from("order_items").insert({
        id: randomUUID(),
        order_id: orderId,
        product_id: product.id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        discount: item.discount || 0,
        paid_value: 0,
        status: "new",
      });
      if (iErr) throw new Error("Gagal menambah item: " + iErr.message);

      // 2) Kurangi/tambah stok + catat stock_movements
      const delta = orderType === "penjualan" ? -item.quantity : item.quantity;
      const newStock = product.stock + delta;
      await this.sb
        .from("products")
        .update({ stock: newStock })
        .eq("id", product.id);

      const { data: maxInv } = await this.sb
        .from("stock_movements")
        .select("invoice_no")
        .order("invoice_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextInvoice = (maxInv?.invoice_no || 0) + 1;
      await this.sb.from("stock_movements").insert({
        id: randomUUID(),
        product_id: product.id,
        order_id: orderId,
        date: now.split("T")[0],
        transaction_type: orderType === "penjualan" ? "Penjualan" : "Pembelian",
        invoice_no: nextInvoice,
        party_name: customerName || contactName,
        qty: delta,
        qty_after: newStock,
        unit: product.unit || "SET",
        created_at: now,
      });
    }

    if (accountId && paidTotal > 0) {
      const txAmount = orderType === "penjualan" ? paidTotal : -paidTotal;
      const txDesc = `${orderType === "penjualan" ? "Penjualan" : "Pembelian"} - ${customerName || contactName}`;
      await this.sb.from("account_transactions").insert({
        id: randomUUID(),
        account_id: accountId,
        order_id: orderId,
        order_type: orderType,
        contact_name: customerName || contactName,
        amount: txAmount,
        description: txDesc,
        date: now.split("T")[0],
        created_at: now,
      });
      const { data: acc } = await this.sb
        .from("accounts")
        .select("balance")
        .eq("id", accountId)
        .maybeSingle();
      if (acc) {
        await this.sb
          .from("accounts")
          .update({ balance: (acc.balance || 0) + txAmount })
          .eq("id", accountId);
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
    return data;
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
    return [
      `📦 Order: ${order.id.slice(0, 8)}`,
      `Status: ${STATUS_LABELS[order.status] || order.status}`,
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
    if (!orders || orders.length === 0) return [];

    for (const order of orders) {
      const { data: items } = await this.sb
        .from("order_items")
        .select("product_name, quantity, price, discount, product_id")
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
      const statusLabel = STATUS_LABELS[order.status] || order.status;
      msg += `📦 Pesanan: ${productNames}\n`;
      msg += `Status barang: ${statusLabel}\n`;
      if (order.notes) msg += `📝 Catatan: ${order.notes}\n`;
      msg += `💰 Total Tagihan: *Rp ${order.total.toLocaleString("id-ID")}*\n`;
      const paid = order.paid_total || 0;
      if (paid > 0) {
        msg += `Sudah dibayar: Rp ${paid.toLocaleString("id-ID")}\n`;
        msg += `Sisa: Rp ${(order.total - paid).toLocaleString("id-ID")}\n`;
      }
      msg += "\n";
      grandTotal += order.total;
      grandPaid += paid;
    }

    if (orders.length > 1) {
      msg += `📊 *Grand Total: Rp ${grandTotal.toLocaleString("id-ID")}*\n`;
      msg += `Total dibayar: Rp ${grandPaid.toLocaleString("id-ID")}\n`;
      msg += `*Sisa: Rp ${(grandTotal - grandPaid).toLocaleString("id-ID")}*\n\n`;
    }

    msg += `🏦 Metode Pembayaran: Transfer Bank\n`;
    msg += `${BANK_INFO}\n`;
    msg += `⏰ Batas Pembayaran: ${deadlineStr}\n\n`;
    msg += "Mohon melakukan pembayaran sebelum batas waktu yang ditentukan. ";
    msg += "Setelah transfer, silakan kirim bukti pembayaran agar pesanan dapat segera kami proses.\n";
    msg += "Mohon abaikan apabila sudah melakukan payment.\n\n";
    msg += "Terima kasih atas kepercayaannya. 🙏";
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

    const activeOrders = orders.filter((o) => !["shipped", "delivered", "completed"].includes(o.status));
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
      .not("status", "in", "(shipped,delivered,completed)");
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
    // Return JSON for wa-bot.js to handle sending
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
      "• tambahpelanggan <nama>|<telepon> — tambah pelanggan",
      "• kiriminvoice <nama> — kirim invoice ke pelanggan",
      "• kirimsemua — kirim invoice ke semua pelanggan aktif",
    ].join("\n");
  }

  return "Perintah tidak dikenali. Ketik: bantuan";
}
