const BOT_ORDER_URL = process.env.BOT_ORDER_URL || 'https://mamanay.vercel.app/api/bot-order';
const BOT_API_TOKEN = process.env.BOT_API_TOKEN || 'mamanay2026';

async function pushOrderToSupabase(o) {
  try {
    const varian = (o.variant || '').trim();

    const res = await fetch(BOT_ORDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOT_API_TOKEN}`,
      },
      body: JSON.stringify({
        items: [{
          product_id: null,
          product_name: o.product,
          price: o.hargaSatuan || 0,
          quantity: o.qty || 1,
          variant: varian || null,
        }],
        customer_name: o.sender || '',
        phone: o.number || '',
        notes: `WA: ${o.message}${varian ? ` | varian: ${varian}` : ''}`,
        payment_type: 'qris',
        paid_total: 0,
        order_type: 'penjualan',
      }),
    });

    const data = await res.json();
    if (data.ok) {
      console.log('Supabase ok: order', data.orderId, '| total', data.total, '| varian:', varian || '-');
    } else {
      console.log('Supabase fail:', data.error);
    }
  } catch (e) {
    console.log('Supabase fail:', e.message);
  }
}

module.exports = { pushOrderToSupabase };
