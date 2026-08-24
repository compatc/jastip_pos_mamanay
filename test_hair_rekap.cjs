require('dotenv').config();
const { getApi } = require('./supabase.js');

(async () => {
  const api = await getApi();
  const nama = 'Hair Straight';

  // Simulate buatRekapProduk logic
  const cleanName = nama.replace(/\[.*?\]|\b(ready|readyh|po)\b/gi, '').replace(/\s+/g, ' ').trim();
  console.log('cleanName:', cleanName);

  const { data } = await api.from('order_items')
    .select('product_name, variant, quantity, price, discount, order_id')
    .or(`product_name.eq.${nama},product_name.ilike.%${cleanName}%`);

  console.log('Items found:', data?.length);

  if (data && data.length > 0) {
    const orderIds = [...new Set(data.map(i => i.order_id))];
    console.log('Order IDs:', orderIds);

    // This is the filter
    const { data: supaOrders } = await api.from('orders')
      .select('id, customer_id, created_at, order_type')
      .in('id', orderIds)
      .eq('order_type', 'penjualan');

    console.log('Orders after filter (penjualan only):', supaOrders?.length);
    supaOrders?.forEach(o => console.log(`  ${o.id.slice(0,8)} | ${o.order_type}`));

    // Check which orders were filtered out
    const filteredIds = new Set((supaOrders || []).map(o => o.id));
    const excluded = orderIds.filter(id => !filteredIds.has(id));
    console.log('\nExcluded orders (not penjualan):', excluded);
    
    // Get details of excluded orders
    if (excluded.length > 0) {
      const { data: excludedOrders } = await api.from('orders')
        .select('id, customer_id, order_type')
        .in('id', excluded);
      const custIds = [...new Set((excludedOrders || []).map(o => o.customer_id).filter(Boolean))];
      const { data: custs } = await api.from('customers')
        .select('id, name')
        .in('id', custIds);
      
      (excludedOrders || []).forEach(o => {
        const cust = (custs || []).find(c => c.id === o.customer_id);
        console.log(`  ${o.id.slice(0,8)} | ${cust?.name} | ${o.order_type}`);
      });
    }
  }
})();
