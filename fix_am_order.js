const fs = require('fs');
const f = '/opt/wa-bot/orders.json';
const orders = JSON.parse(fs.readFileSync(f, 'utf8'));

let fixed = 0;
for (const o of orders) {
  if (o.product === 'Greney TY251128 Red' && o.sender === 'A.m💄') {
    console.log('BEFORE:', JSON.stringify({ variant: o.variant, qty: o.qty, hargaSatuan: o.hargaSatuan, total: o.total }));
    o.variant = '40/90b';
    o.qty = 1;
    o.total = 55000;
    fixed++;
    console.log('AFTER:', JSON.stringify({ variant: o.variant, qty: o.qty, hargaSatuan: o.hargaSatuan, total: o.total }));
  }
}

if (fixed > 0) {
  fs.writeFileSync(f, JSON.stringify(orders, null, 2), 'utf8');
  console.log('Fixed', fixed, 'order(s)');
} else {
  console.log('No matching order found');
}
