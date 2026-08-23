export type OrderStatus = "new" | "belum-ready" | "ready" | "paid" | "shipped" | "delivered" | "completed" | "deleted";
export type PaymentStatus = "unpaid" | "dp" | "paid";
export type FulfillmentStatus = "belum_ready" | "ready" | "shipped" | "diterima" | "completed" | "cancelled";

export type CustomerCategory = "pelanggan" | "supplier";

export type OrderType = "penjualan" | "pembelian";

export type PaymentType = "tf" | "qris" | "split" | "shopee" | "cash";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  category: CustomerCategory;
  points: number;
  total_spent: number;
  member_level: string;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  user_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  total: number;
  paid_total: number;
  refund_total: number;
  diskon: number;
  order_type: OrderType;
  payment_type: PaymentType;
  ongkir: number;
  notes: string;
  qris_notes: string;
  account_id: string | null;
  courier?: string;
  resi?: string;
  shopee_order_no?: string;
  created_at: string;
  updated_at: string;
  invoice_sent_at?: string | null;
  customer_name?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  price: number;
  quantity: number;
  discount: number;
  paid_value: number;
  status: OrderStatus;
}

export interface Product {
  id: string;
  name: string;
  cost_price: number;
  sell_price: number;
  stock: number;
  unit: string;
  image: string;
  shopee_pcs: number;
  created_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  order_id: string;
  date: string;
  transaction_type: string;
  invoice_no: number;
  party_name: string;
  qty: number;
  qty_after: number;
  unit: string;
  variant: string;
  created_at: string;
}

export interface ProductDiscount {
  id: string;
  product_id: string;
  min_qty: number;
  discount_price: number;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "cashier";
  auth_source: "supabase" | "offline";
}

export type AccountType = "cash" | "bank";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  icon: string;
  account_number: string;
  created_at: string;
}

export interface AccountTransaction {
  id: string;
  account_id: string;
  order_id: string | null;
  order_type: string | null;
  contact_name: string;
  amount: number;
  description: string;
  date: string;
  created_at: string;
}

export interface Refund {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  reason: string;
  status: "pending" | "completed" | "cancelled";
  created_at: string;
}

export interface RefundItem {
  id: string;
  refund_id: string;
  order_item_id: string;
  product_name: string;
  quantity: number;
  price: number;
  refund_amount: number;
}
