-- Shopee Sync setup
-- Run in Supabase Dashboard > SQL Editor

ALTER TABLE products ADD COLUMN IF NOT EXISTS shopee_item_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopee_synced_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopee_category_id TEXT;

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS shopee_model_id TEXT;

CREATE TABLE IF NOT EXISTS shopee_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  shop_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE shopee_tokens DISABLE ROW LEVEL SECURITY;
