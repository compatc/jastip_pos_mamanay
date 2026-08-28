const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

const oldBlock = `    // Two-step query: exact match + fuzzy match (avoids .or() space encoding issues)
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

const newBlock = `    // Also strip trailing color words so "mainan kuda laut biru" matches "mainan kuda laut kuning" etc.
    const colorWords = /\\s+(biru|kuning|pink|ungu|merah|hijau|putih|hitam|abu|coklat|gold|silver|navy|tosca|milo|mocca|army|lavender|rose|coral|cream|peach|maroon|grey|brokenwhite|offwhite)$/i;
    const baseName = cleanName.replace(colorWords, '').trim();
    // Three queries: exact + fuzzy + base name (catches different color variants)
    const { data: exactData } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .eq('product_name', nama);
    const { data: fuzzyData } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .ilike('product_name', '%' + cleanName + '%');
    let baseData = [];
    if (baseName !== cleanName) {
      const { data: bd } = await api.from('order_items')
        .select('product_name, variant, quantity, price, discount, order_id')
        .ilike('product_name', '%' + baseName + '%');
      baseData = bd || [];
    }
    const data = [...(exactData || []), ...(fuzzyData || []), ...baseData];
    // Dedupe by order_id+variant
    const seenIds = new Set();
    const dataUniq = data.filter(i => { const k = i.order_id + '|' + (i.variant||''); if (seenIds.has(k)) return false; seenIds.add(k); return true; });
    console.log('[Rekap] Query:', nama, '| exact:', exactData?.length || 0, '| fuzzy:', fuzzyData?.length || 0, '| base:', baseData.length, '| total:', dataUniq.length);`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  fs.writeFileSync('/opt/wa-bot/index.js', code);
  console.log('FIXED');
} else {
  console.log('NOT FOUND');
}
