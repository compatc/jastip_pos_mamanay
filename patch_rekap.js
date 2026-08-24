const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

// Replace buatRekapProduk to also fetch from Supabase
const oldFunc = `function buatRekapProduk(nama, judul) {
  const list = orders.filter((o) => {
    const onama = ((o.product || o.productDesc || '').split('\\n')[0].trim()) || '(tanpa produk)';
    const isPenjualan = !o.orderType || o.orderType === 'penjualan';
    return onama === nama && isPenjualan;
  });

  if (list.length === 0) {
    return \`📋 *REKAP ORDER*\\n\${judul || ''}\\nBelum ada order untuk *\${nama}*.\`;
  }

  const full = list[0].productDesc || list[0].product || nama;
  const unit = parseUnit(full);
  const per = full.match(/(\\d{1,3}(?:\\.\\d{3})+)\\s*\\/\\s*(\\d+)\\s*(set|pcs)/i);

  let out = \`📋 *REKAP ORDER*\\n\${judul || ''}\\n\`;
  out += \`list po *\${nama}*\`;
  if (per) {
    const hargaNominal = parseInt(per[1].replace(/\\./g, ''), 10);
    out += \` harga \${formatRupiah(hargaNominal)}/ \${per[2]} \${per[3].toLowerCase()}\`;
  } else if (parsePrice(full)) {
    out += \` harga \${formatRupiah(parsePrice(full))}/ 1 \${unit}\`;
  }
  out += \`\\n\`;

  if (unit === 'set') {
    const pcsSet = parsePcsPerSet(full);
    if (pcsSet) out += \`1 set: \${pcsSet}pcs\\n\`;
  }

  const groups = new Map();
  for (const x of list) {
    const v = ((x.variant || '').trim() || 'tanpa varian').toUpperCase();
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(x);
  }

  let totalAll = 0;
  for (const [v, items] of groups) {
    out += \`\\n*\${v}*\\n\`;
    items.forEach((x, i) => {
      const last4 = String(x.number || '').slice(-4);
      const nomor = last4 ? \` -- \${last4}\` : '';
      out += \`\${i + 1}. \${x.sender}\${nomor} -- \${x.qty}\\n\`;
    });
    const sub = items.reduce((s, x) => s + x.qty, 0);
    totalAll += sub;
    out += \`subtotal: \${sub}\\n\`;
  }

  out += \`\\ntotal: \${totalAll} \${unit}\\n\`;
  return out;
}`;

const newFunc = `async function buatRekapProduk(nama, judul) {
  // Local orders (from WA bot)
  const localList = orders.filter((o) => {
    const onama = ((o.product || o.productDesc || '').split('\\n')[0].trim()) || '(tanpa produk)';
    const isPenjualan = !o.orderType || o.orderType === 'penjualan';
    return onama === nama && isPenjualan;
  });

  // Fetch from Supabase (includes web/app orders)
  let supaItems = [];
  try {
    const { getApi } = require('./supabase.js');
    const api = await getApi();
    const { data } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .eq('product_name', nama);
    if (data && data.length > 0) {
      const orderIds = [...new Set(data.map(i => i.order_id))];
      const { data: supaOrders } = await api.from('orders')
        .select('id, customer_id, created_at, order_type')
        .in('id', orderIds)
        .eq('order_type', 'penjualan');
      const supaOrderMap = new Map((supaOrders || []).map(o => [o.id, o]));
      const { data: custs } = await api.from('customers')
        .select('id, name')
        .in('id', [...new Set((supaOrders || []).map(o => o.customer_id).filter(Boolean))]);
      const custMap = new Map((custs || []).map(c => [c.id, c.name]));
      for (const item of data) {
        const o = supaOrderMap.get(item.order_id);
        if (!o) continue;
        supaItems.push({
          sender: custMap.get(o.customer_id) || 'Pelanggan',
          number: '',
          qty: item.quantity,
          variant: item.variant || '',
          product: nama,
          timestamp: o.created_at,
          source: 'supabase'
        });
      }
    }
  } catch (e) {
    console.log('[Rekap] Supabase fetch error:', e.message);
  }

  // Merge local + supabase, dedupe by sender+variant+qty+timestamp
  const seen = new Set();
  const allItems = [];
  for (const x of [...supaItems, ...localList]) {
    const key = (x.sender || '') + '|' + (x.variant || '') + '|' + x.qty + '|' + (x.timestamp || '');
    if (!seen.has(key)) { seen.add(key); allItems.push(x); }
  }

  const list = allItems;

  if (list.length === 0) {
    return \`📋 *REKAP ORDER*\\n\${judul || ''}\\nBelum ada order untuk *\${nama}*.\`;
  }

  const full = (localList[0]?.productDesc || localList[0]?.product || nama);
  const unit = parseUnit(full);
  const per = full.match(/(\\d{1,3}(?:\\.\\d{3})+)\\s*\\/\\s*(\\d+)\\s*(set|pcs)/i);

  let out = \`📋 *REKAP ORDER*\\n\${judul || ''}\\n\`;
  out += \`list po *\${nama}*\`;
  if (per) {
    const hargaNominal = parseInt(per[1].replace(/\\./g, ''), 10);
    out += \` harga \${formatRupiah(hargaNominal)}/ \${per[2]} \${per[3].toLowerCase()}\`;
  } else if (parsePrice(full)) {
    out += \` harga \${formatRupiah(parsePrice(full))}/ 1 \${unit}\`;
  }
  out += \`\\n\`;

  if (unit === 'set') {
    const pcsSet = parsePcsPerSet(full);
    if (pcsSet) out += \`1 set: \${pcsSet}pcs\\n\`;
  }

  const groups = new Map();
  for (const x of list) {
    const v = ((x.variant || '').trim() || 'tanpa varian').toUpperCase();
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(x);
  }

  let totalAll = 0;
  for (const [v, items] of groups) {
    out += \`\\n*\${v}*\\n\`;
    items.forEach((x, i) => {
      const last4 = String(x.number || '').slice(-4);
      const nomor = last4 ? \` -- \${last4}\` : '';
      out += \`\${i + 1}. \${x.sender}\${nomor} -- \${x.qty}\\n\`;
    });
    const sub = items.reduce((s, x) => s + x.qty, 0);
    totalAll += sub;
    out += \`subtotal: \${sub}\\n\`;
  }

  out += \`\\ntotal: \${totalAll} \${unit}\\n\`;
  return out;
}`;

if (code.includes(oldFunc)) {
  code = code.replace(oldFunc, newFunc);
  fs.writeFileSync(path, code);
  console.log('Patched! buatRekapProduk now fetches from Supabase.');
} else {
  console.log('SKIP — buatRekapProduk not found (may have different format)');
}
