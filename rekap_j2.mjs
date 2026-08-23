import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://tmnykmpdqdavspmirspw.supabase.co', 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF');
await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });

const productId = '4440be9c-e3fb-46e4-bf9d-31cf21faf71f';
const { data: mov } = await sb.from('stock_movements').select('qty, transaction_type, party_name').eq('product_id', productId).order('date');

const penjualan = mov.filter(m => m.transaction_type === 'Penjualan');
const pembelian = mov.filter(m => m.transaction_type === 'Pembelian');
const grouped = {};
for (const m of penjualan) {
  const name = m.party_name;
  if (!grouped[name]) grouped[name] = 0;
  grouped[name] += Math.abs(m.qty);
}
for (const [name, qty] of Object.entries(grouped)) {
  console.log(name + ' -- ' + qty + ' pcs');
}
const totalJual = penjualan.reduce((s,m) => s+Math.abs(m.qty),0);
const totalBeli = pembelian.reduce((s,m) => s+m.qty,0);
console.log('total: ' + totalJual);
console.log('sisa: ' + (totalBeli - totalJual));
