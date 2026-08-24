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
  console.log('Auth OK');

  const keep = 'f1023dd5-a0c7-4506-901b-3927acfac882';
  const remove = '65e37939-cc79-444c-8e64-579139c3c8e5';

  // Move orders
  const { data: moved } = await sb.from('orders').update({ customer_id: keep }).eq('customer_id', remove).select('id');
  console.log('Orders moved:', moved?.length || 0);

  // Merge points
  const { data: k } = await sb.from('customers').select('total_spent, points').eq('id', keep).single();
  const { data: r } = await sb.from('customers').select('total_spent, points').eq('id', remove).single();
  if (k && r) {
    await sb.from('customers').update({
      total_spent: (k.total_spent || 0) + (r.total_spent || 0),
      points: (k.points || 0) + (r.points || 0),
    }).eq('id', keep);
    console.log('Points merged:', r.points || 0);
  }

  // Delete
  const { error: delErr } = await sb.from('customers').delete().eq('id', remove);
  console.log('Deleted:', delErr ? delErr.message : 'ok');

  // Verify
  const { data: after } = await sb.from('customers').select('id,name,phone').ilike('name', '%riin%');
  console.log('After:', JSON.stringify(after, null, 2));
})();
