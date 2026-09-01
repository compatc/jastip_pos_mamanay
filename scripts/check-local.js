const fs = require('fs');
const orders = JSON.parse(fs.readFileSync('/opt/wa-bot/orders.json', 'utf8'));
const magnetic = orders.filter(o => (o.product || '').toLowerCase().includes('magnetic parking'));
console.log('Local magnetic parking orders:');
magnetic.forEach(o => console.log(JSON.stringify({ sender: o.sender, product: o.product, qty: o.qty, pushed: o.pushed, number: o.number }, null, 2)));
