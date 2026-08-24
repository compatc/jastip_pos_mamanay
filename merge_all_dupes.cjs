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

  const norm = (s) => {
    let d = (s || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
    if (d.startsWith('62')) d = d;
    else if (d.startsWith('8')) d = '62' + d;
    return d;
  };

  const { data: all } = await sb.from('customers').select('id, name, phone').order('name');
  console.log('Total customers:', all.length);

  // Group by normalized phone
  const byPhone = {};
  for (const c of all) {
    const p = norm(c.phone);
    if (!p) continue;
    if (!byPhone[p]) byPhone[p] = [];
    byPhone[p].push(c);
  }

  const dupes = Object.entries(byPhone).filter(([k, v]) => v.length > 1);
  console.log('Duplicate phones:', dupes.length);

  for (const [phone, records] of dupes) {
    console.log(`\nPhone ${phone}: ${records.map(r => r.name + ' (' + r.id.slice(0,8) + ')').join(', ')}`);
    // Keep first, merge rest
    const keep = records[0];
    for (let i = 1; i < records.length; i++) {
      const remove = records[i];
      const { data: moved } = await sb.from('orders').update({ customer_id: keep.id }).eq('customer_id', remove.id).select('id');
      console.log(`  Moved ${(moved||[]).length} orders from ${remove.name} to ${keep.name}`);
      
      const { data: k } = await sb.from('customers').select('total_spent, points').eq('id', keep.id).single();
      const { data: r } = await sb.from('customers').select('total_spent, points').eq('id', remove.id).single();
      if (k && r) {
        await sb.from('customers').update({
          total_spent: (k.total_spent || 0) + (r.total_spent || 0),
          points: (k.points || 0) + (r.points || 0),
          phone: phone,
        }).eq('id', keep.id);
      }
      
      await sb.from('customers').delete().eq('id', remove.id);
      console.log(`  Deleted ${remove.name}`);
    }
    // Normalize kept phone
    await sb.from('customers').update({ phone }).eq('id', keep.id);
  }

  // Also check by name
  const byName = {};
  for (const c of all) {
    const n = (c.name || '').trim().toLowerCase();
    if (!n) continue;
    if (!byName[n]) byName[n] = [];
    byName[n].push(c);
  }
  const nameDupes = Object.entries(byName).filter(([k, v]) => v.length > 1);
  console.log('\nDuplicate names:', nameDupes.length);
  for (const [name, records] of nameDupes) {
    console.log(`  ${name}: ${records.map(r => r.phone + ' (' + r.id.slice(0,8) + ')').join(', ')}`);
  }

  console.log('\nDone!');
})();
