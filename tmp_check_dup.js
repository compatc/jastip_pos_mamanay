const { createClient } = require('@supabase/supabase-js');
async function main() {
  const sb = createClient('https://tmnykmpdqdavspmirspw.supabase.co', 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF');
  await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });
  const { data: items } = await sb.from('order_items').select('id, order_id, product_name, quantity, variant, price, created_at').eq('product_name', 'HAIR STRAIGHTENING COMB');
  console.log('=== ORDER ITEMS (' + (items||[]).length + ') ===');
  (items||[]).forEach(i => console.log(i.order_id.slice(0,8) + ' | qty:' + i.quantity + ' | price:' + i.price + ' | ' + i.created_at));
  const orderIds = [...new Set((items||[]).map(i => i.order_id))];
  const { data: orders } = await sb.from('orders').select('id, customer_id, total, payment_status, fulfillment_status, created_at, notes').in('id', orderIds);
  console.log('=== ORDERS (' + (orders||[]).length + ') ===');
  (orders||[]).forEach(o => console.log(o.id.slice(0,8) + ' | cust:' + o.customer_id.slice(0,8) + ' | total:' + o.total + ' | ' + o.payment_status + ' | ' + o.fulfillment_status + ' | ' + o.created_at + ' | notes:' + (o.notes||'').slice(0,60)));
  const customerIds = [...new Set((orders||[]).map(o => o.customer_id))];
  const { data: customers } = await sb.from('customers').select('id, name, phone').in('id', customerIds);
  console.log('=== CUSTOMERS ===');
  (customers||[]).forEach(c => console.log(c.id.slice(0,8) + ' | ' + c.name + ' | ' + c.phone));
}
main();
