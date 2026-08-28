const o = require('/opt/wa-bot/orders.json');
const sprei = o.filter(x => (x.product || '').toLowerCase().includes('sprei'));
console.log('Sprei local orders:', JSON.stringify(sprei.map(x => ({
  product: x.product, variant: x.variant, qty: x.qty, pushed: x.pushed, sender: x.sender
})), null, 2));

// Also check current promo
const promo = require('/opt/wa-bot/current-promo.json');
console.log('\nCurrent promo product:', promo.product);
console.log('Promo variants:', JSON.stringify(promo.variants));
