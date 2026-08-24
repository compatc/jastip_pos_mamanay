const fs = require('fs');
const orders = JSON.parse(fs.readFileSync('/opt/wa-bot/orders.json', 'utf8'));
const w = orders.filter(x => (x.sender || '').toLowerCase().includes('wulandari'));
w.forEach(x => console.log(JSON.stringify({product: x.product, sender: x.sender, number: x.number, qty: x.qty, variant: x.variant})));
