CREATE TABLE IF NOT EXISTS order_audit_log (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_paid_total NUMERIC,
  new_paid_total NUMERIC,
  old_payment_status TEXT,
  new_payment_status TEXT,
  old_fulfillment_status TEXT,
  new_fulfillment_status TEXT,
  performed_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_order_id ON order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON order_audit_log(created_at);
