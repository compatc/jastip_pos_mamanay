const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://tmnykmpdqdavspmirspw.supabase.co', 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF');

(async () => {
  const { data: auth } = await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });
  const token = auth.session.access_token;

  // Check if refunds table exists
  const r1 = await sb.from('refunds').select('id').limit(1);
  console.log('refunds table:', r1.error ? 'MISSING - ' + r1.error.message : 'EXISTS');

  const r2 = await sb.from('refund_items').select('id').limit(1);
  console.log('refund_items table:', r2.error ? 'MISSING - ' + r2.error.message : 'EXISTS');

  // Check if refund_total column exists
  const r3 = await sb.from('orders').select('refund_total').limit(1);
  console.log('refund_total column:', r3.error ? 'MISSING - ' + r3.error.message : 'EXISTS');
})();
