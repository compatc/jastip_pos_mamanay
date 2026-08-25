const { createClient } = require('@supabase/supabase-js');

const url = 'https://tmnykmpdqdavspmirspw.supabase.co';
const key = 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF';
const sb = createClient(url, key);

async function main() {
  await sb.auth.signInWithPassword({ email: 'nurulazizahy@gmail.com', password: 'drdiskman' });

  // Current DB stock
  const { data: prod } = await sb.from('products').select('id, name, stock, stock_type').eq('name', 'ganci stitch ungu').single();
  console.log('DB products.stock:', prod.stock);

  // Calculate from stock_movements
  const { data: movs } = await sb.from('stock_movements').select('qty').eq('product_id', prod.id);
  const movStock = (movs || []).reduce((a, b) => a + b.qty, 0);
  console.log('From stock_movements:', movStock, '(' + (movs?.length || 0) + ' movements)');

  // Check product_variants
  const { data: variants } = await sb.from('product_variants').select('id, name, stock').eq('product_id', prod.id);
  console.log('Product variants:', JSON.stringify(variants));

  // Check variant stock movements
  if (variants && variants.length > 0) {
    for (const v of variants) {
      const { data: vmovs } = await sb.from('stock_movements').select('qty').eq('product_id', prod.id).eq('variant', v.name);
      const vmovStock = (vmovs || []).reduce((a, b) => a + b.qty, 0);
      console.log(`  Variant "${v.name}": base=${v.stock}, movements=${vmovStock}, total=${v.stock + vmovStock}`);
    }
  }

  // What the frontend sees (variantStock computation)
  const variantStockMap = {};
  if (variants) {
    for (const v of variants) {
      if (!variantStockMap[v.product_id]) variantStockMap[v.product_id] = {};
      variantStockMap[v.product_id][v.name] = v.stock || 0;
    }
  }
  for (const m of (movs || [])) {
    const v = m.variant || '(tanpa varian)';
    if (!variantStockMap[prod.id]) variantStockMap[prod.id] = {};
    variantStockMap[prod.id][v] = (variantStockMap[prod.id][v] || 0) + m.qty;
  }

  const vs = variantStockMap[prod.id];
  if (vs && Object.keys(vs).length > 0) {
    const total = Object.values(vs).reduce((a, b) => a + Math.max(0, b), 0);
    console.log('\nFrontend variantStock:', JSON.stringify(vs));
    console.log('Frontend computed stock:', total);
  } else {
    console.log('\nNo variants - frontend uses products.stock:', prod.stock);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
