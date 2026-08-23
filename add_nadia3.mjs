import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://tmnykmpdqdavspmirspw.supabase.co', 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF');
await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });

const orderId = '2ab908ac-7e08-4ecf-873c-3d22d88dde9d';
const productId = '4440be9c-e3fb-46e4-bf9d-31cf21faf71f';
const now = new Date().toISOString();

const { error: itemErr } = await sb.from('order_items').insert({
  id: crypto.randomUUID(),
  order_id: orderId,
  product_id: productId,
  product_name: 'Moell spesial jastiper2',
  quantity: 1,
  price: 125000
});
if (itemErr) { console.log('Item error:', itemErr.message); } else { console.log('Order item created'); }

const { error: movErr } = await sb.from('stock_movements').insert({
  id: crypto.randomUUID(),
  product_id: productId,
  transaction_type: 'Penjualan',
  qty: -1,
  qty_after: 1,
  party_name: 'Nadia 8118',
  invoice_no: 'nadia-j2',
  date: now.slice(0,10),
  order_id: orderId
});
if (movErr) { console.log('Movement error:', movErr.message); } else { console.log('Stock movement created'); }

console.log('Done!');
