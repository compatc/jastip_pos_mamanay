export type OrderStatus = "new" | "paid" | "shipped" | "delivered" | "completed" | "deleted";

export type CustomerCategory = "pelanggan" | "supplier";

export type OrderType = "penjualan" | "pembelian";

export type PaymentType = "tf" | "qris" | "split" | "shopee";

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
  order_type: OrderType;
  payment_type: PaymentType;
  ongkir: number;
  notes: string;
  created_at: string;
  updated_at: string;
  customer_name?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
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
  date: string;
  transaction_type: string;
  invoice_no: number;
  party_name: string;
  qty: number;
  qty_after: number;
  unit: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "cashier";
  auth_source: "supabase" | "offline";
}
