require('dotenv').config();
const { getApi } = require('./supabase.js');

(async () => {
  const api = await getApi();

  // Check Hair Straight orders
  const { data: items } = await api.from('order_items')
    .select('product_name, variant, quantity, order_id')
    .ilike('product_name', '%hair straight%');

  console.log('=== Hair Straight items ===');
  if (!items || items.length === 0) {
    console.log('No items');
    return;
  }

  const orderIds = [...new Set(items.map(i => i.order_id))];
  const { data: orders } = await api.from('orders')
    .select('id, customer_id, order_type, created_at')
    .in('id', orderIds);

  const custIds = [...new Set((orders || []).map(o => o.customer_id).filter(Boolean))];
  const { data: custs } = await api.from('customers')
    .select('id, name, phone')
    .in('id', custIds);

  const orderMap = {};
  (orders || []).forEach(o => {
    const cust = (custs || []).find(c => c.id === o.customer_id);
    orderMap[o.id] = { name: cust?.name || '?', phone: cust?.phone || '', order_type: o.order_type };
  });

  items.forEach(i => {
    const o = orderMap[i.order_id] || {};
    console.log(`  ${i.variant || '-'} x${i.quantity} | ${o.name} | type: ${o.order_type} | order: ${i.order_id}`);
  });

  // Count by type
  const byType = {};
  items.forEach(i => {
    const o = orderMap[i.order_id] || {};
    byType[o.order_type] = (byType[o.order_type] || 0) + i.quantity;
  });
  console.log('\nBy type:', byType);
})();
