import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://tmnykmpdqdavspmirspw.supabase.co', 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF');
await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });

const customerId = 'c0000001-0000-4000-8000-000000000029';
const productId = '4440be9c-e3fb-46e4-bf9d-31cf21faf71f';
const orderId = crypto.randomUUID();
const now = new Date().toISOString();

const { data: order, error: orderErr } = await sb.from('orders').insert({
  id: orderId,
  customer_id: customerId,
  total: 125000,
  payment_status: 'unpaid',
  fulfillment_status: 'belum_ready',
  order_type: 'penjualan',
  created_at: now,
  updated_at: now
}).select().single();

if (orderErr) { console.log('Order error:', orderErr.message); process.exit(); }
console.log('Order created:', orderId);

const { error: itemErr } = await sb.from('order_items').insert({
  order_id: orderId,
  product_id: productId,
  product_name: 'Moell spesial jastiper2',
  qty: 1,
  price: 125000
});
if (itemErr) { console.log('Item error:', itemErr.message); } else { console.log('Order item created'); }

const { error: movErr } = await sb.from('stock_movements').insert({
  product_id: productId,
  transaction_type: 'Penjualan',
  qty: -1,
  party_name: 'Nadia 8118',
  party_phone: '+62822-9301-8118',
  invoice_no: orderId.slice(0,8),
  date: now.slice(0,10),
  notes: 'Order dari WA group'
});
if (movErr) { console.log('Movement error:', movErr.message); } else { console.log('Stock movement created'); }

const { data: prod } = await sb.from('products').select('stock').eq('id', productId).single();
const newStock = (prod?.stock || 0) - 1;
const { error: stockErr } = await sb.from('products').update({ stock: newStock }).eq('id', productId);
if (stockErr) { console.log('Stock update error:', stockErr.message); } else { console.log('Stock updated to', newStock); }

console.log('Done!');
