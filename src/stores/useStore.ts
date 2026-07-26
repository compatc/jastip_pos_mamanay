import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { uuid } from "../lib/uuid";
import type { Customer, CustomerCategory, Order, OrderItem, OrderStatus, OrderType, PaymentType, Product, StockMovement } from "../types";

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

  orders: Order[];
  loadOrders: (customerId: string) => Promise<void>;
  addOrder: (
    customerId: string,
    items: {
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
    notes: string;
  }) => Promise<string>;

  orderItems: OrderItem[];
  loadOrderItems: (orderId: string) => Promise<void>;
  updateOrder: (orderId: string, params: {
    status: OrderStatus;
    paymentType: PaymentType;
    contactName: string;
    items: { product_id: string; product_name: string; price: number; quantity: number; discount: number }[];
    paidTotal: number;
    ongkir: number;
    notes: string;
    orderType: OrderType;
  }) => Promise<void>;
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
    image?: string
  ) => Promise<string>;
  updateProduct: (
    id: string,
    name: string,
    costPrice: number,
    sellPrice: number,
    stock: number,
    unit: string,
    image?: string
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
    unit: string
  ) => Promise<void>;

  isOnline: boolean;
  setOnline: (val: boolean) => void;
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
    const orderId = uuid();
    const now = new Date().toISOString();
    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const { error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        customer_id: customerId,
        user_id: user?.id || "",
        status: "new",
        total,
        paid_total: 0,
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
          product_name: item.product_name,
          price: item.price,
          quantity: item.quantity,
          paid_value: 0,
          status: "new",
        });

      const { data: product } = await supabase
        .from("products")
        .select("id, stock")
        .eq("name", item.product_name)
        .single();
      if (product) {
        await supabase
          .from("products")
          .update({ stock: product.stock - item.quantity })
          .eq("id", product.id);
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

  addStandaloneOrder: async ({ orderType, paymentType, contactName, items, paidTotal, ongkir, notes }) => {
    const user = get().user;
    const orderId = uuid();
    const now = new Date().toISOString();
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity - (i.discount || 0), 0);
    const orderTotal = subtotal + (ongkir || 0);
    const initialStatus = orderTotal <= (paidTotal || 0) ? "paid" : "new";

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

    const { error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        customer_id: customerId,
        user_id: user?.id || "",
        status: initialStatus,
        total: orderTotal,
        paid_total: paidTotal,
        order_type: orderType,
        payment_type: paymentType,
        ongkir: ongkir || 0,
        notes: notes || "",
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
          product_name: item.product_name,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount || 0,
          paid_value: 0,
          status: "new",
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
    return orderId;
  },

  orderItems: [],
  loadOrderItems: async (orderId) => {
    const { data, error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    if (error) { console.error("loadOrderItems:", error); return; }
    set({ orderItems: (data || []) as OrderItem[] });
  },

  updateOrder: async (orderId, { status, paymentType, contactName, items, paidTotal, ongkir, notes, orderType }) => {
    const now = new Date().toISOString();

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("order_type")
      .eq("id", orderId)
      .single();
    const oldOrderType = (existingOrder?.order_type as OrderType) || orderType;

    const { data: oldItems } = await supabase
      .from("order_items")
      .select("product_name, quantity")
      .eq("order_id", orderId);

    if (oldItems && oldItems.length > 0) {
      for (const row of oldItems) {
        const { data: product } = await supabase
          .from("products")
          .select("id, stock")
          .eq("name", row.product_name)
          .single();
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
    const orderTotal = subtotal + (ongkir || 0);

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        customer_id: customerId,
        status,
        total: orderTotal,
        paid_total: paidTotal,
        order_type: orderType,
        payment_type: paymentType,
        ongkir: ongkir || 0,
        notes: notes || "",
        updated_at: now,
      })
      .eq("id", orderId);
    if (updateError) throw updateError;

    for (const item of items) {
      const itemId = uuid();
      await supabase
        .from("order_items")
        .insert({
          id: itemId,
          order_id: orderId,
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
        .eq("name", item.product_name)
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
      .select("product_name, quantity")
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

      const { data: product } = await supabase
        .from("products")
        .select("id, stock")
        .eq("name", oldItem.product_name)
        .single();

      if (product && newQty !== oldItem.quantity) {
        const diff = newQty - oldItem.quantity;
        const stockDelta = order?.order_type === "penjualan" ? -diff : diff;
        await supabase
          .from("products")
          .update({ stock: product.stock + stockDelta })
          .eq("id", product.id);
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
    await supabase
      .from("orders")
      .update({ paid_total: paidTotal, updated_at: new Date().toISOString() })
      .eq("id", orderId);
  },

  deleteOrder: async (orderId) => {
    const { data: items } = await supabase
      .from("order_items")
      .select("product_name, quantity")
      .eq("order_id", orderId);

    if (items && items.length > 0) {
      for (const row of items) {
        const { data: product } = await supabase
          .from("products")
          .select("id, stock")
          .eq("name", row.product_name)
          .single();
        if (product) {
          await supabase
            .from("products")
            .update({ stock: product.stock + row.quantity })
            .eq("id", product.id);
        }
      }
    }

    const now = new Date().toISOString();
    await supabase
      .from("orders")
      .update({ status: "deleted", updated_at: now })
      .eq("id", orderId);
    await supabase
      .from("order_items")
      .update({ status: "deleted" })
      .eq("order_id", orderId);

    await get().loadProducts();
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

  addProduct: async (name, costPrice, sellPrice, stock, unit, image) => {
    const id = uuid();
    const created_at = new Date().toISOString();
    const { error } = await supabase
      .from("products")
      .insert({
        id,
        name,
        cost_price: costPrice,
        sell_price: sellPrice,
        stock,
        unit: unit || "PCS",
        image: image || "",
        created_at,
      });
    if (error) throw error;
    await get().loadProducts();
    return id;
  },

  updateProduct: async (id, name, costPrice, sellPrice, stock, unit, image) => {
    const { error } = await supabase
      .from("products")
      .update({
        name,
        cost_price: costPrice,
        sell_price: sellPrice,
        stock,
        unit: unit || "PCS",
        image: image || "",
      })
      .eq("id", id);
    if (error) throw error;
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
    set({ stockMovements: (data || []) as StockMovement[] });
  },

  addStockMovement: async (productId, date, transactionType, invoiceNo, partyName, qty, qtyAfter, unit) => {
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
        created_at,
      });
    if (error) throw error;
    await get().loadStockMovements(productId);
  },

  isOnline: navigator.onLine,
  setOnline: (val) => set({ isOnline: val }),
}));
