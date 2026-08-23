import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://tmnykmpdqdavspmirspw.supabase.co', 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF');
await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });

const orderId = '2ab908ac-7e08-4ecf-873c-3d22d88dde9d';
const productId = '4440be9c-e3fb-46e4-bf9d-31cf21faf71f';
const now = new Date().toISOString();

const { error: movErr } = await sb.from('stock_movements').insert({
  id: crypto.randomUUID(),
  product_id: productId,
  transaction_type: 'Penjualan',
  qty: -1,
  qty_after: 1,
  party_name: 'Nadia 8118',
  invoice_no: 897,
  date: now.slice(0,10),
  order_id: orderId,
  created_at: now
});
if (movErr) { console.log('Movement error:', movErr.message); } else { console.log('Stock movement created'); }

console.log('Done!');
