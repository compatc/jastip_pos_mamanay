const BASE = 'https://mamanay.vercel.app/api/catalog-order?type=bot';
const TOKEN = 'mamanay2026';

const orders = [
  { name: 'Riin 7346', phone: '6287881587346', product: 'HAIR STRAIGHTENING COMB', price: 90000, qty: 1 },
  { name: 'Bina', phone: '62895702771704', product: 'HAIR STRAIGHTENING COMB', price: 90000, qty: 1 },
  { name: 'demmy', phone: '6282311479985', product: 'HAIR STRAIGHTENING COMB', price: 90000, qty: 1 },
  { name: 'Ratih Fitrianii', phone: '6285157008482', product: 'Meja Lipat Multifungsi', price: 45000, qty: 1, variant: 'bu' },
  { name: 'Dhea Andreani', phone: '6282155283100', product: 'HAIR STRAIGHTENING COMB', price: 90000, qty: 1 },
];

async function push(o) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    body: JSON.stringify({
      items: [{ product_name: o.product, price: o.price, quantity: o.qty, variant: o.variant || null }],
      customer_name: o.name, phone: o.phone,
      notes: 'WA order', payment_type: 'qris', paid_total: 0, order_type: 'penjualan',
    }),
  });
  const d = await res.json();
  console.log(o.name, d.ok ? 'OK id:' + d.orderId : 'FAIL: ' + d.error);
}

(async () => { for (const o of orders) await push(o); })();
