const { createClient } = require('@supabase/supabase-js');
async function main() {
  const sb = createClient('https://tmnykmpdqdavspmirspw.supabase.co', 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF');
  await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });
  
  const { data: items, error } = await sb.from('order_items').select('id, order_id, product_name, quantity, price').eq('product_name', 'HAIR STRAIGHTENING COMB');
  if (error) { console.log('Error:', error.message); return; }
  console.log('Total order_items:', items.length);
  
  const orderIds = [...new Set(items.map(i => i.order_id))];
  const { data: orders } = await sb.from('orders').select('id, customer_id, created_at, notes').in('id', orderIds);
  
  const byCustomer = {};
  for (const o of orders) {
    if (!byCustomer[o.customer_id]) byCustomer[o.customer_id] = [];
    byCustomer[o.customer_id].push(o);
  }
  
  for (const [cid, custOrders] of Object.entries(byCustomer)) {
    if (custOrders.length <= 1) {
      console.log('Customer', cid.slice(0,8), ': 1 order (keep)');
      continue;
    }
    custOrders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const keep = custOrders[0];
    const remove = custOrders.slice(1);
    console.log('Customer', cid.slice(0,8), ':', custOrders.length, 'orders, keeping', keep.id.slice(0,8), ', removing', remove.map(r => r.id.slice(0,8)).join(', '));
    
    for (const r of remove) {
      const { error: e1 } = await sb.from('order_items').delete().eq('order_id', r.id);
      const { error: e2 } = await sb.from('orders').delete().eq('id', r.id);
      console.log('  Deleted:', r.id.slice(0,8), e1 ? e1.message : 'ok', e2 ? e2.message : 'ok');
    }
  }
  
  const { data: after } = await sb.from('order_items').select('id').eq('product_name', 'HAIR STRAIGHTENING COMB');
  console.log('After:', after ? after.length : 0, 'items');
}
main();
