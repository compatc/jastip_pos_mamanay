import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tmnykmpdqdavspmirspw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF';
const EMAIL = 'nurulazizahy@gmail.com';
const PASSWORD = 'drdiskman';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });

const products = [
  { id: 'ee5d18bc-4898-455b-9ba4-7a89cf340643', name: 'Moell spesial jastiper1' },
  { id: '4440be9c-e3fb-46e4-bf9d-31cf21faf71f', name: 'Moell spesial jastiper2' },
];

for (const p of products) {
  const { data: movements } = await sb
    .from('stock_movements')
    .select('qty, transaction_type, date')
    .eq('product_id', p.id)
    .order('date');

  let stock = 0;
  console.log(`\n=== ${p.name} (stok awal: 0) ===`);
  for (const m of (movements || [])) {
    stock += m.qty;
    console.log(`  ${m.date} | ${m.transaction_type} | qty: ${m.qty > 0 ? '+' : ''}${m.qty} | → stok: ${stock}`);
  }
  console.log(`  STOK AKHIR: ${stock}`);

  const { error } = await sb.from('products').update({ stock }).eq('id', p.id);
  if (error) console.error('  UPDATE GAGAL:', error.message);
  else console.log('  ✅ Updated');
}
