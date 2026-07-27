export type OrderStatus = "new" | "paid" | "shipped" | "delivered" | "completed" | "deleted";

export type CustomerCategory = "pelanggan" | "supplier";

export type OrderType = "penjualan" | "pembelian";

export type PaymentType = "tf" | "qris" | "split" | "shopee" | "cash";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  category: CustomerCategory;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  user_id: string;
  status: OrderStatus;
  total: number;
  paid_total: number;
  diskon: number;
  order_type: OrderType;
  payment_type: PaymentType;
  ongkir: number;
  notes: string;
  account_id: string | null;
  created_at: string;
  updated_at: string;
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
