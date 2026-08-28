const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

// Add logging after the or() query
const oldCode = `    const { data } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .or(\`product_name.eq.\${nama},product_name.ilike.%\${cleanName}%\`);`;

const newCode = `    const filterStr = \`product_name.eq.\${nama},product_name.ilike.%\${cleanName}%\`;
    console.log('[Rekap] Query:', filterStr);
    const { data, error: queryErr } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .or(filterStr);
    if (queryErr) console.log('[Rekap] Query error:', queryErr.message);`;

if (code.includes(oldCode)) {
  code = code.replace(oldCode, newCode);
  fs.writeFileSync('/opt/wa-bot/index.js', code);
  console.log('LOGGING ADDED');
} else {
  console.log('NOT FOUND');
}
