// Test buatRekapProduk directly
const { getApi } = require('/opt/wa-bot/supabase.js');

async function test() {
  const api = await getApi();
  const nama = 'sprei motif premium size 180';
  const cleanName = nama.replace(/\[.*?\]|\b(ready|readyh|po)\b/gi, '').replace(/\s+/g, ' ').trim();
  
  console.log('Querying with nama:', nama);
  console.log('cleanName:', cleanName);
  
  const { data, error } = await api.from('order_items')
    .select('product_name, variant, quantity, price, discount, order_id')
    .or(`product_name.eq.${nama},product_name.ilike.%${cleanName}%`);
  
  if (error) {
    console.log('ERROR:', error.message);
    console.log('Details:', JSON.stringify(error));
  } else {
    console.log('Found', data.length, 'items');
    data.forEach(i => console.log(' ', i.product_name, '|', i.variant, '| qty:', i.quantity, '| order:', i.order_id.slice(0,8)));
    
    if (data.length > 0) {
      const orderIds = [...new Set(data.map(i => i.order_id))];
      const { data: supaOrders } = await api.from('orders')
        .select('id, customer_id, created_at, order_type, fulfillment_status')
        .in('id', orderIds)
        .eq('order_type', 'penjualan')
        .not('fulfillment_status', 'in', '(completed,cancelled)');
      console.log('Orders after filter:', supaOrders?.length);
      supaOrders?.forEach(o => console.log(' ', o.id.slice(0,8), o.order_type, o.fulfillment_status));
    }
  }
}

test().catch(console.error);
