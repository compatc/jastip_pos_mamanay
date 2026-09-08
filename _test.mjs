const KEY = 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF';
const URL_BASE = 'https://tmnykmpdqdavspmirspw.supabase.co';

async function supaLogin() {
  const res = await fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' })
  });
  return (await res.json()).access_token;
}

const token = await supaLogin();

// Get some order IDs
const ordersRes = await fetch(URL_BASE + '/rest/v1/orders?select=id&status=neq.deleted&limit=5', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + token }
});
const orders = await ordersRes.json();
const ids = orders.map(o => o.id);
console.log('Test IDs:', ids.map(i => i.slice(0,8)));

// Test query with supabase-js style (using native fetch)
for (const id of ids) {
  const t = Date.now();
  const res = await fetch(URL_BASE + '/rest/v1/order_items?select=*&order_id=eq.' + id, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + token }
  });
  const items = await res.json();
  console.log(id.slice(0,8) + ':', items?.length || 0, 'items,', Date.now()-t+'ms', res.status);
  if (items?.length > 0) {
    console.log('  First:', items[0].product_name, 'qty:', items[0].quantity, 'variant:', items[0].variant);
  }
  if (items?.error) console.log('  ERROR:', JSON.stringify(items.error));
}

// Also test the exact query the app uses: .in with 5 IDs
const t1 = Date.now();
const inRes = await fetch(URL_BASE + '/rest/v1/order_items?select=order_id,product_name,quantity,product_id,variant&order_id=in.(' + ids.join(',') + ')', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + token }
});
const inData = await inRes.json();
console.log('\n.in() query:', Date.now()-t1+'ms,', inData?.length || 0, 'items');
