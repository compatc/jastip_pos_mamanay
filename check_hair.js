const orders = require('/opt/wa-bot/orders.json');
const hair = orders.filter(o => o.product === 'HAIR STRAIGHTENING COMB' && o.group === '120363404605912473@g.us');
console.log('Total:', hair.length, 'orders');
hair.forEach(o => console.log(`${o.sender} | ${o.number} | ${o.qty} pcs | ${o.tanggal} ${o.jam}`));
