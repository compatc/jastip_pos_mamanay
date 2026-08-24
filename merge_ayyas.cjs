require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_EMAIL;
const pass = process.env.SUPABASE_PASSWORD;

(async () => {
  const sb = createClient(url, key);
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { console.log('Auth fail:', error.message); return; }

  const keep = 'c0000001-0000-4000-8000-000000000005';
  const remove = '368870e7-13ea-49c5-845b-327e31ba9eeb';

  const { data: moved } = await sb.from('orders').update({ customer_id: keep }).eq('customer_id', remove).select('id');
  console.log('Orders moved:', (moved||[]).length);

  const { data: k } = await sb.from('customers').select('total_spent, points').eq('id', keep).single();
  const { data: r } = await sb.from('customers').select('total_spent, points').eq('id', remove).single();
  if (k && r) {
    await sb.from('customers').update({
      total_spent: (k.total_spent || 0) + (r.total_spent || 0),
      points: (k.points || 0) + (r.points || 0),
    }).eq('id', keep);
  }
  await sb.from('customers').delete().eq('id', remove);
  console.log('Deleted ayyas mamagege duplicate');
})();
