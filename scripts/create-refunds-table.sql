-- Refund tables for POS Mama Nay
-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refund_items (
  id TEXT PRIMARY KEY,
  refund_id TEXT NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC NOT NULL,
  refund_amount NUMERIC NOT NULL
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_total NUMERIC NOT NULL DEFAULT 0;

-- RLS policies
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON refunds FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON refund_items FOR ALL USING (true);
