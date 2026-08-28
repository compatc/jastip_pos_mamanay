const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

const oldBlock = `    console.log('[Rekap] Query:', nama);
    const { data, error: queryErr } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .or(\`product_name.eq.\${nama},product_name.ilike.%\${cleanName}%\`);
    if (queryErr) console.log('[Rekap] Query error:', queryErr.message, JSON.stringify(queryErr));
    console.log('[Rekap] Query result:', data?.length || 0, 'items');
    if (data) data.forEach(i => console.log('[Rekap]  -', i.product_name, '|', i.variant, '|', i.quantity));`;

const newBlock = `    // Two-step query: exact match + fuzzy match (avoids .or() space encoding issues)
    const { data: exactData } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .eq('product_name', nama);
    const { data: fuzzyData } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .ilike('product_name', '%' + cleanName + '%');
    const data = [...(exactData || []), ...(fuzzyData || [])];
    // Dedupe by id (in case exact match is also in fuzzy)
    const seenIds = new Set();
    const dataUniq = data.filter(i => { if (seenIds.has(i.order_id + i.variant)) return false; seenIds.add(i.order_id + i.variant); return true; });
    console.log('[Rekap] Query:', nama, '| exact:', exactData?.length || 0, '| fuzzy:', fuzzyData?.length || 0, '| total:', dataUniq.length);`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  fs.writeFileSync('/opt/wa-bot/index.js', code);
  console.log('FIXED');
} else {
  console.log('NOT FOUND');
}
