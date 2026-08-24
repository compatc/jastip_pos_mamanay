const fs = require('fs');
const orders = JSON.parse(fs.readFileSync('/opt/wa-bot/orders.json', 'utf8'));
const magnetic = orders.filter(o => (o.product || '').toLowerCase().includes('magnetic'));
for (const o of magnetic) {
  console.log('product:', o.product, '| sender:', o.sender, '| qty:', o.qty, '| variant:', o.variant || '-', '| supaId:', o.supabaseId || 'none');
}
