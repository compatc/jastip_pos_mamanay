import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://tmnykmpdqdavspmirspw.supabase.co',
  'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF'
);

await sb.auth.signInWithPassword({
  email: 'nurulazizahy@gmail.com',
  password: 'drdiskman'
});

const sql = `
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
`;

const { error } = await sb.rpc('exec_sql', { sql });
if (error) {
  console.log('exec_sql RPC error:', error.message);
  console.log('Trying individual approach...');
  
  // Try creating via RPC with different function names
  const fns = ['exec_sql', 'execute_sql', 'run_sql'];
  for (const fn of fns) {
    const { error: e2 } = await sb.rpc(fn, { query: sql });
    if (!e2) {
      console.log('Success with', fn);
      break;
    }
    console.log(fn + ':', e2.message);
  }
} else {
  console.log('Created successfully');
}

// Verify
const { data, error: err2 } = await sb.from('order_audit_log').select('id').limit(1);
if (err2) console.log('Verify:', err2.message);
else console.log('Table exists, accessible');
