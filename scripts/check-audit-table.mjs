const { createClient } = require("@supabase/supabase-js");
const sb = createClient("https://tmnykmpdqdavspmirspw.supabase.co", "sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF");
(async () => {
  await sb.auth.signInWithPassword({ email: "nurulazizahy@gmail.com", password: "drdiskman" });

  const { data: check, error: e2 } = await sb.from("order_audit_log").select("id").limit(1);
  if (e2 && e2.message.includes("Could not find the table")) {
    console.log("Table does NOT exist. Need to create via Supabase SQL Editor.");
    console.log("Run this SQL in Supabase Dashboard > SQL Editor:");
    console.log(`
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
    `);
  } else {
    console.log("order_audit_log:", e2 ? e2.message : "EXISTS");
  }
})();
