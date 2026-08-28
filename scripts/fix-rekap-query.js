const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

const oldBlock = `    const { data } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .or(\`product_name.eq.\${nama},product_name.ilike.%\${cleanName}%\`);`;

const newBlock = `    console.log('[Rekap] Query:', nama);
    const { data, error: queryErr } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .or(\`product_name.eq.\${nama},product_name.ilike.%\${cleanName}%\`);
    if (queryErr) console.log('[Rekap] Query error:', queryErr.message, JSON.stringify(queryErr));
    console.log('[Rekap] Query result:', data?.length || 0, 'items');
    if (data) data.forEach(i => console.log('[Rekap]  -', i.product_name, '|', i.variant, '|', i.quantity));`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  fs.writeFileSync('/opt/wa-bot/index.js', code);
  console.log('LOGGING ADDED');
} else {
  console.log('NOT FOUND');
}
