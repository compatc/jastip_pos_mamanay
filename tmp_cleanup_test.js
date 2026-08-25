const { createClient } = require('@supabase/supabase-js');
async function main() {
  const sb = createClient('https://tmnykmpdqdavspmirspw.supabase.co', 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF');
  await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });
  
  const { data: cust } = await sb.from('customers').select('id, name').ilike('name', '%test%');
  console.log('test customers:', JSON.stringify(cust));
  if (cust && cust.length > 0) {
    for (const c of cust) {
      const { data: ords } = await sb.from('orders').select('id').eq('customer_id', c.id);
      const ids = (ords || []).map(o => o.id);
      if (ids.length) {
        await sb.from('order_items').delete().in('order_id', ids);
        await sb.from('orders').delete().in('id', ids);
      }
      await sb.from('customers').delete().eq('id', c.id);
      console.log('deleted:', c.name);
    }
  }
}
main();
