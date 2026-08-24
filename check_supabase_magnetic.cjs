require('dotenv').config();
const { getApi } = require('./supabase.js');
(async () => {
  const api = await getApi();
  if (!api) { console.log('getApi null'); return; }
  const { data } = await api.from('order_items').select('product_name, variant, quantity, order_id').ilike('product_name', '%magnetic%');
  console.log('Supabase items:', JSON.stringify(data, null, 2));
  
  if (data && data.length > 0) {
    const orderIds = [...new Set(data.map(i => i.order_id))];
    const { data: orders } = await api.from('orders').select('id, customer_id, order_type').in('id', orderIds);
    console.log('Orders:', JSON.stringify(orders, null, 2));
    
    const custIds = [...new Set((orders || []).map(o => o.customer_id).filter(Boolean))];
    if (custIds.length > 0) {
      const { data: custs } = await api.from('customers').select('id, name, phone').in('id', custIds);
      console.log('Customers:', JSON.stringify(custs, null, 2));
    }
  }
})();
