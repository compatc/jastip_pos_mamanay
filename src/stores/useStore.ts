import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { uuid } from "../lib/uuid";
import { awardPoints } from "../lib/loyalty";
import type { Account, AccountTransaction, Customer, CustomerCategory, Order, OrderItem, OrderStatus, OrderType, PaymentType, Product, ProductDiscount, ProductVariant, StockMovement } from "../types";

interface PosStore {
  user: { id: string; email: string; name: string; auth_source?: "supabase" | "offline" } | null;
  setUser: (
    user: { id: string; email: string; name: string; auth_source?: "supabase" | "offline" } | null
  ) => void;

  customers: Customer[];
  loadCustomers: () => Promise<void>;
  addCustomer: (
    name: string,
    phone: string,
    address: string,
    category?: CustomerCategory
  ) => Promise<string>;
  updateCustomer: (
    id: string,
    name: string,
    phone: string,
    address: string,
    category: CustomerCategory
  ) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  orders: Order[];
  loadOrders: (customerId: string) => Promise<void>;
  addOrder: (
    customerId: string,
    items: {
      product_id: string;
      product_name: string;
      price: number;
      quantity: number;
    }[]
  ) => Promise<string>;

  allOrders: Order[];
  loadAllOrders: () => Promise<void>;
  addStandaloneOrder: (params: {
    orderType: OrderType;
    paymentType: PaymentType;
    contactName: string;
    items: { product_id: string; product_name: string; price: number; quantity: number; discount: number }[];
    paidTotal: number;
    ongkir: number;
    diskon: number;
    notes: string;
    accountId?: string;
  }) => Promise<string>;

  orderItems: OrderItem[];
  loadOrderItems: (orderId: string) => Promise<OrderItem[]>;
  updateOrder: (orderId: string, params: {
    status: OrderStatus;
    paymentType: PaymentType;
    contactName: string;
    items: { product_id: string; product_name: string; price: number; quantity: number; discount: number }[];
    paidTotal: number;
    ongkir: number;
    diskon: number;
    notes: string;
    orderType: OrderType;
    accountId?: string | null;
    courier?: string;
    resi?: string;
    shopeeOrderNo?: string;
  }) => Promise<void>;
  markOrdersPaid: (orderIds: string[]) => Promise<void>;
  updateItemStatus: (
    itemId: string,
    status: OrderStatus
  ) => Promise<void>;
  updateItemPaidValue: (
    itemId: string,
    paidValue: number
  ) => Promise<void>;
  updateItemQuantity: (
    itemId: string,
    newQty: number,
    orderId: string
  ) => Promise<void>;

  updateOrderPaidTotal: (
    orderId: string,
    paidTotal: number
  ) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;

  products: Product[];
  loadProducts: () => Promise<void>;
  addProduct: (
    name: string,
    costPrice: number,
    sellPrice: number,
    stock: number,
    unit: string,
    image?: string,
    shopeePcs?: number,
    stockType?: string,
    description?: string
  ) => Promise<string>;
  updateProduct: (
    id: string,
    name: string,
    costPrice: number,
    sellPrice: number,
    stock: number,
    unit: string,
    image?: string,
    shopeePcs?: number,
    stockType?: string,
    description?: string
  ) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  stockMovements: StockMovement[];
  loadStockMovements: (productId: string) => Promise<void>;
  addStockMovement: (
    productId: string,
    date: string,
    transactionType: string,
    invoiceNo: number,
    partyName: string,
    qty: number,
    qtyAfter: number,
    unit: string,
    variant?: string
  ) => Promise<void>;

  productVariants: ProductVariant[];
  loadProductVariants: (productId: string) => Promise<void>;
  addProductVariant: (productId: string, name: string, image?: string, stock?: number, stockType?: string) => Promise<string>;
  updateProductVariant: (id: string, name: string, image?: string, stock?: number, stockType?: string) => Promise<void>;
  deleteProductVariant: (id: string) => Promise<void>;

  variantStock: Record<string, Record<string, number>>;
  loadVariantStock: () => Promise<void>;

  productDiscounts: ProductDiscount[];
  loadProductDiscounts: (productId: string) => Promise<void>;
  loadAllProductDiscounts: () => Promise<void>;
  addProductDiscount: (productId: string, minQty: number, discountPrice: number) => Promise<void>;
  deleteProductDiscount: (id: string, productId: string) => Promise<void>;

  accounts: Account[];
  loadAccounts: () => Promise<void>;
  addAccount: (name: string, type: string, icon: string, accountNumber?: string) => Promise<void>;
  updateAccount: (id: string, name: string, type: string, icon: string, accountNumber: string, balance: number) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  accountTransactions: AccountTransaction[];
  loadAccountTransactions: (accountId: string) => Promise<void>;
  createAccountTransaction: (accountId: string, orderId: string | null, orderType: string | null, contactName: string, amount: number, description: string, date: string) => Promise<void>;
  createRefund: (orderId: string, items: { order_item_id: string; product_name: string; quantity: number; price: number; refund_amount: number }[], reason: string) => Promise<{ error?: string }>;

  isOnline: boolean;
  setOnline: (val: boolean) => void;

  fontSize: "kecil" | "normal" | "besar";
  setFontSize: (val: "kecil" | "normal" | "besar") => void;
}

const getInitialUser = () => {
  try {
    const saved = localStorage.getItem("pos_user");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

export const useStore = create<PosStore>((set, get) => ({
  user: getInitialUser(),
  setUser: (user) => {
    if (user) {
      localStorage.setItem("pos_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("pos_user");
    }
    set({ user });
  },

  customers: [],
  loadCustomers: async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { console.error("loadCustomers:", error); return; }
    set({ customers: (data || []) as Customer[] });
  },

  addCustomer: async (name, phone, address, category) => {
    const id = uuid();
    const created_at = new Date().toISOString();
    const { error } = await supabase
      .from("customers")
      .insert({ id, name, phone, address, category: category || "pelanggan", created_at });
    if (error) throw error;
    await get().loadCustomers();
    return id;
  },

  updateCustomer: async (id, name, phone, address, category) => {
    const { error } = await supabase
      .from("customers")
      .update({ name, phone, address, category })
      .eq("id", id);
    if (error) throw error;
    await get().loadCustomers();
  },

  deleteCustomer: async (id) => {
    const { data: orders } = await supabase.from("orders").select("id").eq("customer_id", id);
    if (orders && orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      await supabase.from("order_items").delete().in("order_id", orderIds);
      await supabase.from("orders").delete().in("id", orderIds);
    }
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
    await get().loadCustomers();
  },

  orders: [],
  loadOrders: async (customerId) => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_id", customerId)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });
    if (error) { console.error("loadOrders:", error); return; }
    set({ orders: (data || []) as Order[] });
  },

  addOrder: async (customerId, items) => {
    const user = get().user;
    if (!user?.id || user.auth_source === "offline") {
      throw new Error("Sesi login tidak valid. Silakan login ulang.");
    }
    const orderId = uuid();
    const now = new Date().toISOString();
    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const { error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        customer_id: customerId,
        user_id: user?.id || "",
        status: "belum-ready",
        payment_status: "unpaid",
        fulfillment_status: "belum_ready",
        total,
        paid_total: 0,
        order_type: "penjualan",
        payment_type: "tf",
        created_at: now,
        updated_at: now,
      });
    if (orderError) throw orderError;

    for (const item of items) {
      const itemId = uuid();
      await supabase
        .from("order_items")
        .insert({
          id: itemId,
          order_id: orderId,
          product_id: item.product_id,
          product_name: item.product_name,
          price: item.price,
          quantity: item.quantity,
          paid_value: 0,
          status: "new",
        });

      const { data: product } = await supabase
        .from("products")
        .select("id, stock, unit")
        .eq("id", item.product_id)
        .single();
      if (product) {
        const newStock = product.stock - item.quantity;
        await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", product.id);

        const maxInvoice = await supabase
          .from("stock_movements")
          .select("invoice_no")
          .order("invoice_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextInvoice = ((maxInvoice?.data?.invoice_no as number) || 0) + 1;

        await supabase
          .from("stock_movements")
          .insert({
            id: uuid(),
            product_id: product.id,
            order_id: orderId,
            date: now.split("T")[0],
            transaction_type: "Penjualan",
            invoice_no: nextInvoice,
            party_name: "",
            qty: -item.quantity,
            qty_after: newStock,
            unit: product.unit || "SET",
            created_at: now,
          });
      }
    }

    await get().loadOrders(customerId);
    await get().loadProducts();
    return orderId;
  },

  allOrders: [],
  loadAllOrders: async () => {
    const [ordersRes, customersRes] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .neq("status", "deleted")
        .order("created_at", { ascending: false }),
      supabase
        .from("customers")
        .select("id, name"),
    ]);

    const customerMap = new Map<string, string>();
    if (customersRes.data) {
      for (const c of customersRes.data) {
        customerMap.set(c.id, c.name);
      }
    }

    const allOrders = (ordersRes.data || []).map((o: any) => ({
      ...o,
      customer_name: customerMap.get(o.customer_id) || "",
    })) as (Order & { customer_name: string })[];
    set({ allOrders });
  },

  addStandaloneOrder: async ({ orderType, paymentType, contactName, items, paidTotal, ongkir, diskon, notes, accountId }) => {
    const user = get().user;
    if (!user?.id || user.auth_source === "offline") {
      throw new Error("Sesi login tidak valid. Silakan login ulang.");
    }
    const orderId = uuid();
    const now = new Date().toISOString();
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity - (i.discount || 0), 0);
    const orderTotal = subtotal - (diskon || 0) + (ongkir || 0);
    const initialStatus = orderTotal <= (paidTotal || 0) ? "paid" : "belum-ready";

    let customerId = "";
    if (contactName.trim()) {
      const { data: existing, error: findErr } = await supabase
        .from("customers")
        .select("id")
        .ilike("name", contactName.trim())
        .limit(1)
        .single();
      if (findErr && findErr.code !== "PGRST116") throw new Error("Gagal mencari pelanggan: " + findErr.message);
      if (existing) {
        customerId = existing.id;
      } else {
        customerId = uuid();
        const { error: custErr } = await supabase
          .from("customers")
          .insert({
            id: customerId,
            name: contactName.trim(),
            phone: "",
            address: "",
            category: "pelanggan",
            created_at: now,
          });
        if (custErr) throw new Error("Gagal membuat pelanggan: " + custErr.message);
      }
    }

    const { error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        customer_id: customerId,
        user_id: user?.id || "",
        status: initialStatus,
        payment_status: initialStatus === "paid" ? "paid" : "unpaid",
        fulfillment_status: "belum_ready",
        total: orderTotal,
        paid_total: paidTotal,
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

    const itemErrors: string[] = [];
    for (const item of items) {
      const itemId = uuid();
      const { error: itemErr } = await supabase
        .from("order_items")
        .insert({
          id: itemId,
          order_id: orderId,
          product_name: item.product_name,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount || 0,
          paid_value: 0,
          status: "new",
        });
      if (itemErr) {
        itemErrors.push(`${item.product_name}: ${itemErr.message}`);
        continue;
      }

      const { data: product } = await supabase
        .from("products")
        .select("id, stock, unit")
        .eq("id", item.product_id)
        .single();
      if (product) {
        const stockDelta = orderType === "penjualan" ? -item.quantity : item.quantity;
        const newStock = product.stock + stockDelta;
        const { error: stockErr } = await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", product.id);
        if (stockErr) itemErrors.push(`Update stok ${item.product_name}: ${stockErr.message}`);

        const txType = orderType === "penjualan" ? "Penjualan" : "Pembelian";
        const maxInvoice = await supabase
          .from("stock_movements")
          .select("invoice_no")
          .order("invoice_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextInvoice = ((maxInvoice?.data?.invoice_no as number) || 0) + 1;

        const { error: smErr } = await supabase
          .from("stock_movements")
          .insert({
            id: uuid(),
            product_id: product.id,
            order_id: orderId,
            date: now.split("T")[0],
            transaction_type: txType,
            invoice_no: nextInvoice,
            party_name: contactName,
            qty: stockDelta,
            qty_after: newStock,
            unit: product.unit || "SET",
            created_at: now,
          });
        if (smErr) itemErrors.push(`Stock movement ${item.product_name}: ${smErr.message}`);
      } else {
        itemErrors.push(`${item.product_name}: produk tidak ditemukan di database`);
      }
    }
    if (itemErrors.length > 0) {
      throw new Error("Order tersimpan tapi ada error:\n" + itemErrors.join("\n"));
    }

    if (accountId && paidTotal > 0) {
      const txAmount = orderType === "penjualan" ? paidTotal : -paidTotal;
      const txDesc = `${orderType === "penjualan" ? "Penjualan" : "Pembelian"} - ${contactName}`;
      await get().createAccountTransaction(accountId, orderId, orderType, contactName, txAmount, txDesc, now.split("T")[0]);
    }

    if (orderType === "penjualan" && initialStatus === "paid" && paidTotal > 0) {
      const qtyMap = new Map<string, number>();
      for (const it of items) qtyMap.set(it.product_name, (qtyMap.get(it.product_name) || 0) + it.quantity);
      const lines = Array.from(qtyMap.entries()).map(([name, qty]) => `${name} x${qty}`);
      const body = `Rp ${paidTotal.toLocaleString("id-ID")} diterima${contactName.trim() ? ` dari ${contactName.trim()}` : ""}${lines.length ? `\n${lines.join("\n")}` : ""}`;
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Pembayaran Lunas",
        body,
        url: `/orders/${orderId}`,
        type: paymentType,
        order_ids: [orderId],
        amount: paidTotal,
        created_at: now,
      });

      // Award loyalty points for paid orders
      if (customerId) {
        try {
          await awardPoints(customerId, orderId, paidTotal);
        } catch (e) {
          console.error("Failed to award points:", e);
        }
      }
    }

    await get().loadAllOrders();
    await get().loadProducts();
    return orderId;
  },

  orderItems: [],
  loadOrderItems: async (orderId) => {
    set({ orderItems: [] });
    const { data, error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    if (error) { console.error("loadOrderItems:", error); set({ orderItems: [] }); return []; }
    const items = (data || []) as OrderItem[];
    set({ orderItems: items });
    return items;
  },

  updateOrder: async (orderId, { status, paymentType, contactName, items, paidTotal, ongkir, diskon, notes, orderType, accountId, courier, resi, shopeeOrderNo }) => {
    const now = new Date().toISOString();

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("order_type, account_id, paid_total")
      .eq("id", orderId)
      .single();
    const oldOrderType = (existingOrder?.order_type as OrderType) || orderType;
    const oldPaidTotal = existingOrder?.paid_total || 0;
    const oldAccountId = existingOrder?.account_id;

    const { data: oldItems } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity")
      .eq("order_id", orderId);

    if (oldItems && oldItems.length > 0) {
      for (const row of oldItems) {
        let product = null;
        if (row.product_id) {
          const { data } = await supabase
            .from("products")
            .select("id, stock")
            .eq("id", row.product_id)
            .single();
          product = data;
        } else {
          const { data } = await supabase
            .from("products")
            .select("id, stock")
            .eq("name", row.product_name)
            .single();
          product = data;
        }
        if (product) {
          const stockDelta = oldOrderType === "penjualan" ? row.quantity : -row.quantity;
          await supabase
            .from("products")
            .update({ stock: product.stock + stockDelta })
            .eq("id", product.id);
        }
      }
    }

    await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId);
    await supabase
      .from("stock_movements")
      .delete()
      .eq("order_id", orderId);

    let customerId = "";
    if (contactName.trim()) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .ilike("name", contactName.trim())
        .limit(1)
        .single();
      if (existing) {
        customerId = existing.id;
      } else {
        customerId = uuid();
        await supabase
          .from("customers")
          .insert({
            id: customerId,
            name: contactName.trim(),
            phone: "",
            address: "",
            category: "pelanggan",
            created_at: now,
          });
      }
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity - (i.discount || 0), 0);
    const orderTotal = subtotal - (diskon || 0) + (ongkir || 0);

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        customer_id: customerId,
        status,
        payment_status: paidTotal >= orderTotal ? "paid" : paidTotal > 0 ? "dp" : "unpaid",
        fulfillment_status: status === "completed" || status === "paid" ? "completed" : status === "shipped" ? "shipped" : status === "delivered" ? "diterima" : status === "ready" ? "ready" : status === "dibatalkan" ? "cancelled" : "belum_ready",
        total: orderTotal,
        paid_total: paidTotal,
        diskon: diskon || 0,
        order_type: orderType,
        payment_type: paymentType,
        ongkir: ongkir || 0,
        notes: notes || "",
        account_id: accountId || null,
        courier: courier || "",
        resi: resi || "",
        shopee_order_no: shopeeOrderNo || "",
        updated_at: now,
      })
      .eq("id", orderId);
    if (updateError) throw updateError;

    const payDelta = paidTotal - oldPaidTotal;
    const txAccountId = accountId || oldAccountId;
    if (txAccountId && payDelta !== 0) {
      const txAmount = orderType === "penjualan" ? payDelta : -payDelta;
      const txDesc = `${orderType === "penjualan" ? "Penjualan" : "Pembelian"} - ${contactName}`;
      await get().createAccountTransaction(txAccountId, orderId, orderType, contactName, txAmount, txDesc, now.split("T")[0]);
    }

    if (orderType === "penjualan" && customerId && payDelta > 0) {
      try {
        await awardPoints(customerId, orderId, payDelta);
      } catch (e) {
        console.error("Failed to award points from updateOrder:", e);
      }
    }

    for (const item of items) {
      const itemId = uuid();
      await supabase
        .from("order_items")
        .insert({
          id: itemId,
          order_id: orderId,
          product_id: item.product_id,
          product_name: item.product_name,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount || 0,
          paid_value: 0,
          status,
        });

      const { data: product } = await supabase
        .from("products")
        .select("id, stock, unit")
        .eq("id", item.product_id)
        .single();
      if (product) {
        const stockDelta = orderType === "penjualan" ? -item.quantity : item.quantity;
        const newStock = product.stock + stockDelta;
        await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", product.id);

        const txType = orderType === "penjualan" ? "Penjualan" : "Pembelian";
        const maxInvoice = await supabase
          .from("stock_movements")
          .select("invoice_no")
          .order("invoice_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextInvoice = ((maxInvoice?.data?.invoice_no as number) || 0) + 1;

        await supabase
          .from("stock_movements")
          .insert({
            id: uuid(),
            product_id: product.id,
            order_id: orderId,
            date: now.split("T")[0],
            transaction_type: txType,
            invoice_no: nextInvoice,
            party_name: contactName,
            qty: stockDelta,
            qty_after: newStock,
            unit: product.unit || "SET",
            created_at: now,
          });
      }
    }

    await get().loadAllOrders();
    await get().loadProducts();
  },

  markOrdersPaid: async (orderIds) => {
    const now = new Date().toISOString();
    const user = get().user;
    const notified: { id: string; name: string; amount: number; type: string }[] = [];
    for (const orderId of orderIds) {
      const { data: order } = await supabase
        .from("orders")
        .select("id, total, paid_total, account_id, order_type, payment_type, customer_id, status")
        .eq("id", orderId)
        .single();
      if (!order) continue;
      if ((order.paid_total || 0) >= order.total && order.total > 0) continue;
      const payDelta = order.total - (order.paid_total || 0);
      const newStatus = ["new", "belum-ready", "ready"].includes(order.status) ? "paid" : order.status;
      await supabase
        .from("orders")
        .update({ paid_total: order.total, status: newStatus, payment_status: "paid", updated_at: now })
        .eq("id", orderId);

      // Award loyalty points for penjualan orders
      if (order.order_type === "penjualan" && order.customer_id && payDelta > 0) {
        try {
          await awardPoints(order.customer_id, orderId, payDelta);
        } catch (e) {
          console.error("Failed to award points:", e);
        }
      }

      let customerName = "";
      if (order.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("name")
          .eq("id", order.customer_id)
          .single();
        customerName = customer?.name || "";
      }

      if (order.account_id && payDelta > 0) {
        await get().createAccountTransaction(
          order.account_id,
          orderId,
          order.order_type,
          customerName,
          order.order_type === "penjualan" ? payDelta : -payDelta,
          `Penjualan - ${customerName}`,
          now.split("T")[0]
        );
      }

      if (order.order_type === "penjualan" && payDelta > 0) {
        notified.push({ id: orderId, name: customerName, amount: payDelta, type: order.payment_type || "tf" });
      }
    }

    if (notified.length > 0 && user?.id) {
      const ids = notified.map((n) => n.id);
      const { data: itemRows } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity")
        .in("order_id", ids);
      const qtyMap = new Map<string, Map<string, number>>();
      (itemRows || []).forEach((it: { order_id: string; product_name: string; quantity: number }) => {
        let m = qtyMap.get(it.order_id);
        if (!m) {
          m = new Map();
          qtyMap.set(it.order_id, m);
        }
        m.set(it.product_name, (m.get(it.product_name) || 0) + Number(it.quantity || 0));
      });
      for (const n of notified) {
        const lines = Array.from((qtyMap.get(n.id) || new Map<string, number>()).entries()).map(
          ([name, qty]) => `${name} x${qty}`
        );
        const body = `Rp ${n.amount.toLocaleString("id-ID")} diterima${n.name ? ` dari ${n.name}` : ""}${lines.length ? `\n${lines.join("\n")}` : ""}`;
        await supabase.from("notifications").insert({
          user_id: user.id,
          title: "Pembayaran Lunas",
          body,
          url: `/orders/${n.id}`,
          type: n.type,
          order_ids: [n.id],
          amount: n.amount,
          created_at: now,
        });
      }
    }

    await get().loadAllOrders();
  },

  updateItemStatus: async (itemId, status) => {
    await supabase
      .from("order_items")
      .update({ status })
      .eq("id", itemId);
  },

  updateItemPaidValue: async (itemId, paidValue) => {
    await supabase
      .from("order_items")
      .update({ paid_value: paidValue })
      .eq("id", itemId);
  },

  updateItemQuantity: async (itemId, newQty, orderId) => {
    const { data: oldItem } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity")
      .eq("id", itemId)
      .single();

    if (oldItem) {
      await supabase
        .from("order_items")
        .update({ quantity: newQty })
        .eq("id", itemId);

      const { data: order } = await supabase
        .from("orders")
        .select("order_type")
        .eq("id", orderId)
        .single();

      let product = null;
      if (oldItem.product_id) {
        const { data } = await supabase
          .from("products")
          .select("id, stock, unit")
          .eq("id", oldItem.product_id)
          .single();
        product = data;
      } else {
        const { data } = await supabase
          .from("products")
          .select("id, stock, unit")
          .eq("name", oldItem.product_name)
          .single();
        product = data;
      }

      if (product && newQty !== oldItem.quantity) {
        const diff = newQty - oldItem.quantity;
        const stockDelta = order?.order_type === "penjualan" ? -diff : diff;
        const newStock = product.stock + stockDelta;
        await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", product.id);

        const now = new Date().toISOString();
        const maxInvoice = await supabase
          .from("stock_movements")
          .select("invoice_no")
          .order("invoice_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextInvoice = ((maxInvoice?.data?.invoice_no as number) || 0) + 1;

        await supabase
          .from("stock_movements")
          .insert({
            id: uuid(),
            product_id: product.id,
            order_id: orderId,
            date: now.split("T")[0],
            transaction_type: "Penyesuaian Stok",
            invoice_no: nextInvoice,
            party_name: "",
            qty: stockDelta,
            qty_after: newStock,
            unit: product.unit || "SET",
            created_at: now,
          });
      }

      const { data: allItems } = await supabase
        .from("order_items")
        .select("price, quantity")
        .eq("order_id", orderId);
      if (allItems) {
        const newTotal = allItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        await supabase
          .from("orders")
          .update({ total: newTotal, updated_at: new Date().toISOString() })
          .eq("id", orderId);
      }
    }

    await get().loadProducts();
  },

  updateOrderPaidTotal: async (orderId, paidTotal) => {
    const { data: existing } = await supabase
      .from("orders")
      .select("account_id, order_type, customer_id, paid_total, total")
      .eq("id", orderId)
      .single();

    const oldPaid = existing?.paid_total || 0;
    const newPaid = paidTotal;
    const delta = newPaid - oldPaid;
    const newPaymentStatus = newPaid >= (existing?.total || 0) ? "paid" : newPaid > 0 ? "dp" : "unpaid";

    await supabase
      .from("orders")
      .update({ paid_total: paidTotal, payment_status: newPaymentStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (existing?.account_id && delta !== 0) {
      const { data: cust } = await supabase
        .from("customers")
        .select("name")
        .eq("id", existing.customer_id)
        .single();
      const txAmount = existing.order_type === "penjualan" ? delta : -delta;
      const txDesc = `${existing.order_type === "penjualan" ? "Penjualan" : "Pembelian"} - ${cust?.name || ""}`;
      const now = new Date().toISOString();
      await supabase
        .from("account_transactions")
        .insert({
          id: uuid(),
          account_id: existing.account_id,
          order_id: orderId,
          order_type: existing.order_type,
          contact_name: cust?.name || "",
          amount: txAmount,
          description: txDesc,
          date: now.split("T")[0],
          created_at: now,
        });
      const { data: acc } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", existing.account_id)
        .single();
      if (acc) {
        await supabase
          .from("accounts")
          .update({ balance: (acc.balance || 0) + txAmount })
          .eq("id", existing.account_id);
      }
      await get().loadAccounts();
    }

    // Award loyalty points when order becomes fully paid
    if (newPaymentStatus === "paid" && delta > 0 && existing?.order_type === "penjualan" && existing?.customer_id) {
      try {
        await awardPoints(existing.customer_id, orderId, delta);
      } catch (e) {
        console.error("Failed to award points:", e);
      }
    }
  },

  deleteOrder: async (orderId) => {
    const { data: orderInfo } = await supabase
      .from("orders")
      .select("order_type, account_id, paid_total")
      .eq("id", orderId)
      .single();
    const orderType = (orderInfo?.order_type as OrderType) || "penjualan";

    const { data: items } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity")
      .eq("order_id", orderId);

    if (items && items.length > 0) {
      for (const row of items) {
        let product = null;
        if (row.product_id) {
          const { data } = await supabase
            .from("products")
            .select("id, stock, unit")
            .eq("id", row.product_id)
            .single();
          product = data;
        } else {
          const { data } = await supabase
            .from("products")
            .select("id, stock, unit")
            .eq("name", row.product_name)
            .single();
          product = data;
        }
        if (product) {
          const stockDelta = orderType === "penjualan" ? row.quantity : -row.quantity;
          const newStock = product.stock + stockDelta;
          await supabase
            .from("products")
            .update({ stock: newStock })
            .eq("id", product.id);
        }
      }
    }

    await supabase
      .from("stock_movements")
      .delete()
      .eq("order_id", orderId);

    const now = new Date().toISOString();
    await supabase
      .from("orders")
      .update({ status: "deleted", fulfillment_status: "cancelled", updated_at: now })
      .eq("id", orderId);
    await supabase
      .from("order_items")
      .update({ status: "deleted" })
      .eq("order_id", orderId);

    if (orderInfo?.account_id && orderInfo?.paid_total > 0) {
      const { data: txs } = await supabase
        .from("account_transactions")
        .select("id, amount")
        .eq("order_id", orderId);
      if (txs && txs.length > 0) {
        for (const tx of txs) {
          await supabase.from("account_transactions").delete().eq("id", tx.id);
          const { data: acc } = await supabase
            .from("accounts")
            .select("balance")
            .eq("id", orderInfo.account_id)
            .single();
          if (acc) {
            await supabase
              .from("accounts")
              .update({ balance: (acc.balance || 0) - tx.amount })
              .eq("id", orderInfo.account_id);
          }
        }
      }
    }

    await get().loadProducts();
    await get().loadAccounts();
  },

  products: [],
  loadProducts: async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });
    if (error) { console.error("loadProducts:", error); return; }
    set({ products: (data || []) as Product[] });
  },

  addProduct: async (name, costPrice, sellPrice, stock, unit, image, shopeePcs = 1, stockType = "ready", description = "") => {
    const id = uuid();
    const created_at = new Date().toISOString();
    const { error } = await supabase
      .from("products")
      .insert({
        id,
        name,
        description,
        cost_price: costPrice,
        sell_price: sellPrice,
        stock,
        stock_type: stockType,
        unit: unit || "PCS",
        image: image || "",
        shopee_pcs: shopeePcs,
        created_at,
      });
    if (error) throw error;
    await get().loadProducts();
    return id;
  },

  updateProduct: async (id, name, costPrice, sellPrice, stock, unit, image, shopeePcs = 1, stockType = "ready", description = "") => {
    const { error } = await supabase
      .from("products")
      .update({
        name,
        description,
        cost_price: costPrice,
        sell_price: sellPrice,
        stock,
        stock_type: stockType,
        unit: unit || "PCS",
        image: image || "",
        shopee_pcs: shopeePcs,
      })
      .eq("id", id);
    if (error) throw error;

    // Update price in existing order_items for this product
    await supabase
      .from("order_items")
      .update({ price: sellPrice })
      .eq("product_id", id);

    await get().loadProducts();
  },

  deleteProduct: async (id) => {
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id);
    if (error) throw error;
    await get().loadProducts();
  },

  stockMovements: [],
  loadStockMovements: async (productId) => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("product_id", productId)
      .order("date", { ascending: true })
      .order("invoice_no", { ascending: true });
    if (error) { console.error("loadStockMovements:", error); return; }

    const rows = (data || []) as StockMovement[];
    const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];
    let nameMap: Record<string, string> = {};
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, customer_id")
        .in("id", orderIds);
      if (orders && orders.length > 0) {
        const custIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];
        if (custIds.length > 0) {
          const { data: custs } = await supabase
            .from("customers")
            .select("id, name")
            .in("id", custIds);
          const custMap: Record<string, string> = {};
          (custs || []).forEach((c: any) => { custMap[c.id] = c.name; });
          orders.forEach((o: any) => { nameMap[o.id] = custMap[o.customer_id] || ""; });
        }
      }
    }

    const mapped = rows.map((row) => ({
      ...row,
      party_name: row.party_name || nameMap[row.order_id] || "",
    }));
    set({ stockMovements: mapped });
  },

  addStockMovement: async (productId, date, transactionType, invoiceNo, partyName, qty, qtyAfter, unit, variant = "") => {
    const id = uuid();
    const created_at = new Date().toISOString();
    const { error } = await supabase
      .from("stock_movements")
      .insert({
        id,
        product_id: productId,
        date,
        transaction_type: transactionType,
        invoice_no: invoiceNo,
        party_name: partyName,
        qty,
        qty_after: qtyAfter,
        unit,
        variant,
        created_at,
      });
    if (error) throw error;
    await get().loadStockMovements(productId);
  },

  productVariants: [],
  loadProductVariants: async (productId) => {
    const { data, error } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: true });
    if (error) { console.error("loadProductVariants:", error); return; }
    set({ productVariants: (data || []) as ProductVariant[] });
  },

  addProductVariant: async (productId, name, image = "", stock = 0, stockType = null as string | null) => {
    const id = uuid();
    const { error } = await supabase
      .from("product_variants")
      .insert({
        id,
        product_id: productId,
        name,
        image,
        stock,
        stock_type: stockType,
        created_at: new Date().toISOString(),
      });
    if (error) throw error;
    return id;
  },

  updateProductVariant: async (id, name, image = "", stock = 0, stockType = null as string | null) => {
    const { error } = await supabase
      .from("product_variants")
      .update({ name, image, stock, stock_type: stockType })
      .eq("id", id);
    if (error) throw error;
  },

  deleteProductVariant: async (id) => {
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  variantStock: {},
  loadVariantStock: async () => {
    const [movementsRes, variantsRes] = await Promise.all([
      supabase.from("stock_movements").select("product_id, variant, qty"),
      supabase.from("product_variants").select("product_id, name, stock"),
    ]);
    if (movementsRes.error) console.error("loadVariantStock movements:", movementsRes.error);
    if (variantsRes.error) console.error("loadVariantStock variants:", variantsRes.error);

    const result: Record<string, Record<string, number>> = {};

    // Start with product_variants.stock as base
    for (const row of variantsRes.data || []) {
      const pid = row.product_id;
      const v = row.name;
      if (!result[pid]) result[pid] = {};
      result[pid][v] = row.stock || 0;
    }

    // Add stock_movements delta on top
    for (const row of movementsRes.data || []) {
      const pid = row.product_id;
      const v = row.variant || "(tanpa varian)";
      if (!result[pid]) result[pid] = {};
      result[pid][v] = (result[pid][v] || 0) + row.qty;
    }

    set({ variantStock: result });
  },

  productDiscounts: [],
  loadProductDiscounts: async (productId) => {
    const { data, error } = await supabase
      .from("product_discounts")
      .select("*")
      .eq("product_id", productId)
      .order("min_qty", { ascending: true });
    if (error) { console.error("loadProductDiscounts:", error); return; }
    set({ productDiscounts: (data || []) as ProductDiscount[] });
  },

  loadAllProductDiscounts: async () => {
    const { data, error } = await supabase
      .from("product_discounts")
      .select("*")
      .order("product_id")
      .order("min_qty", { ascending: true });
    if (error) { console.error("loadAllProductDiscounts:", error); return; }
    set({ productDiscounts: (data || []) as ProductDiscount[] });
  },

  addProductDiscount: async (productId, minQty, discountPrice) => {
    const { error } = await supabase
      .from("product_discounts")
      .insert({
        id: uuid(),
        product_id: productId,
        min_qty: minQty,
        discount_price: discountPrice,
        created_at: new Date().toISOString(),
      });
    if (error) throw error;
    await get().loadAllProductDiscounts();
  },

  deleteProductDiscount: async (id, productId) => {
    const { error } = await supabase
      .from("product_discounts")
      .delete()
      .eq("id", id);
    if (error) throw error;
    await get().loadAllProductDiscounts();
  },

  accounts: [],
  loadAccounts: async () => {
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { console.error("loadAccounts:", error); return; }
    set({ accounts: (data || []) as Account[] });
  },

  addAccount: async (name, type, icon, accountNumber) => {
    const id = uuid();
    const { error } = await supabase
      .from("accounts")
      .insert({ id, name, type, balance: 0, icon, account_number: accountNumber || "", created_at: new Date().toISOString() });
    if (error) throw error;
    await get().loadAccounts();
  },

  updateAccount: async (id, name, type, icon, accountNumber, balance) => {
    const { error } = await supabase
      .from("accounts")
      .update({ name, type, icon, account_number: accountNumber, balance })
      .eq("id", id);
    if (error) throw error;
    await get().loadAccounts();
  },

  deleteAccount: async (id) => {
    await supabase.from("account_transactions").delete().eq("account_id", id);
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) throw error;
    await get().loadAccounts();
  },

  accountTransactions: [],
  loadAccountTransactions: async (accountId) => {
    const { data, error } = await supabase
      .from("account_transactions")
      .select("*")
      .eq("account_id", accountId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) { console.error("loadAccountTransactions:", error); return; }
    set({ accountTransactions: (data || []) as AccountTransaction[] });
  },

  createAccountTransaction: async (accountId, orderId, orderType, contactName, amount, description, date) => {
    const id = uuid();
    const { error: txErr } = await supabase
      .from("account_transactions")
      .insert({
        id,
        account_id: accountId,
        order_id: orderId,
        order_type: orderType,
        contact_name: contactName,
        amount,
        description,
        date,
        created_at: new Date().toISOString(),
      });
    if (txErr) { console.error("createAccountTransaction:", txErr); return; }

    const { data: acc } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", accountId)
      .single();
    if (acc) {
      await supabase
        .from("accounts")
        .update({ balance: (acc.balance || 0) + amount })
        .eq("id", accountId);
    }
    await get().loadAccounts();
  },

  createRefund: async (orderId, items, reason) => {
    const refundId = "rf-" + uuid().replace(/-/g, "").slice(0, 22);
    const totalRefund = items.reduce((s, i) => s + i.refund_amount, 0);
    const { data: order } = await supabase
      .from("orders")
      .select("id, total, paid_total, refund_total, customer_id, user_id, status")
      .eq("id", orderId)
      .single();
    if (!order) return { error: "Order tidak ditemukan" };

    const currentRefund = order.refund_total || 0;
    const currentPaid = order.paid_total || 0;
    if (currentRefund + totalRefund > order.total) {
      return { error: "Total refund melebihi total order" };
    }

    let customerName = "";
    if (order.customer_id) {
      const { data: cust } = await supabase
        .from("customers").select("name").eq("id", order.customer_id).single();
      customerName = cust?.name || "";
    }

    const { error: refundErr } = await supabase.from("refunds").insert({
      id: refundId,
      order_id: orderId,
      user_id: order.user_id,
      amount: totalRefund,
      reason,
      status: "completed",
      created_at: new Date().toISOString(),
    });
    if (refundErr) return { error: "Gagal membuat refund: " + refundErr.message };

    for (const item of items) {
      await supabase.from("refund_items").insert({
        id: "ri-" + uuid().replace(/-/g, "").slice(0, 22),
        refund_id: refundId,
        order_item_id: item.order_item_id,
        product_name: item.product_name,
        quantity: item.quantity,
        price: item.price,
        refund_amount: item.refund_amount,
      });
    }

    const newTotal = Math.max(0, order.total - totalRefund);
    const newRefundTotal = currentRefund + totalRefund;
    let newStatus = order.status;
    if (newTotal <= 0 && ["paid", "ready"].includes(order.status)) {
      newStatus = "dibatalkan";
    }

    await supabase.from("orders").update({
      total: newTotal,
      refund_total: newRefundTotal,
      status: newStatus,
      payment_status: newStatus === "dibatalkan" ? "unpaid" : undefined,
      fulfillment_status: newStatus === "dibatalkan" ? "cancelled" : undefined,
    }).eq("id", orderId);

    for (const item of items) {
      const { data: orderItem } = await supabase
        .from("order_items").select("product_id").eq("id", item.order_item_id).single();
      if (orderItem) {
        const { data: prod } = await supabase
          .from("products").select("id, stock, unit").eq("id", orderItem.product_id).single();
        if (prod) {
          const newStock = (prod.stock || 0) + item.quantity;
          await supabase.from("products").update({ stock: newStock }).eq("id", prod.id);
          await supabase.from("stock_movements").insert({
            id: uuid(),
            product_id: prod.id,
            order_id: orderId,
            date: new Date().toISOString(),
            transaction_type: "Retur",
            invoice_no: 0,
            party_name: customerName,
            qty: item.quantity,
            qty_after: newStock,
            unit: prod.unit || "pcs",
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    await get().loadAllOrders();
    return {};
  },

  isOnline: navigator.onLine,
  setOnline: (val) => set({ isOnline: val }),

  fontSize: (() => {
    try {
      const saved = localStorage.getItem("pos_font_size");
      return saved === "kecil" || saved === "besar" ? saved : "normal";
    } catch {
      return "normal";
    }
  })(),
  setFontSize: (val) => {
    try {
      localStorage.setItem("pos_font_size", val);
    } catch {
      // ignore storage errors
    }
    set({ fontSize: val });
  },
}));
