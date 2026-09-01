import sys

code = open('/opt/wa-bot/index.js', 'r', encoding='utf-8').read()

oldFuncStart = "function buatRekapProduk(nama, judul) {\n"
oldFuncEnd = "  return out;\n}\n"

# Find the old function boundaries
startIdx = code.find(oldFuncStart)
endIdx = code.find(oldFuncEnd, startIdx) + len(oldFuncEnd) if startIdx >= 0 else -1

if startIdx < 0 or endIdx < 0:
    print("ERROR: Could not find old buatRekapProduk function")
    sys.exit(1)

newFunc = '''async function buatRekapProduk(nama, judul) {
  const normName = (s) => s.replace(/\\[.*?\\]|\\b(ready|readyh|po)\\b/gi, '').replace(/\\s+/g, ' ').trim().toLowerCase();

  // Local orders (from WA bot)
  const localList = orders.filter((o) => {
    const onama = ((o.product || o.productDesc || '').split('\\n')[0].trim()) || '(tanpa produk)';
    const isPenjualan = !o.orderType || o.orderType === 'penjualan';
    return normName(onama) === normName(nama) && isPenjualan && !o.pushed;
  });

  // Fetch from Supabase
  let supaItems = [];
  try {
    const { getApi } = require('./supabase.js');
    const api = await getApi();
    const cleanName = nama.replace(/\\[.*?\\]|\\b(ready|readyh|po)\\b/gi, '').replace(/\\s+/g, ' ').trim();
    const colorWords = /\\s+(biru|kuning|pink|ungu|merah|hijau|putih|hitam|abu|coklat|gold|silver|navy|tosca|milo|mocca|army|lavender|rose|coral|cream|peach|maroon|grey|brokenwhite|offwhite)$/i;
    const baseName = cleanName.replace(colorWords, '').trim();

    const { data: exactData } = await api.from('order_items')
      .select('product_name, variant, quantity, price, discount, order_id')
      .ilike('product_name', '%' + cleanName + '%');
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
    const seenIds = new Set();
    const dataUniq = data.filter(i => { const k = i.order_id + '|' + (i.variant||''); if (seenIds.has(k)) return false; seenIds.add(k); return true; });
    console.log('[Rekap] Query:', nama, '| total:', dataUniq.length);

    if (dataUniq.length > 0) {
      const orderIds = [...new Set(dataUniq.map(i => i.order_id))];
      const { data: supaOrders } = await api.from('orders')
        .select('id, customer_id, created_at, order_type')
        .in('id', orderIds)
        .eq('order_type', 'penjualan').not('fulfillment_status', 'in', '(completed,cancelled)');
      const supaOrderMap = new Map((supaOrders || []).map(o => [o.id, o]));
      const { data: custs } = await api.from('customers')
        .select('id, name, phone')
        .in('id', [...new Set((supaOrders || []).map(o => o.customer_id).filter(Boolean))]);
      const custMap = new Map((custs || []).map(c => [c.id, { name: c.name, phone: c.phone || '' }]));
      for (const item of dataUniq) {
        const o = supaOrderMap.get(item.order_id);
        if (!o) continue;
        const cust = custMap.get(o.customer_id) || { name: 'Pelanggan', phone: '' };
        supaItems.push({
          sender: cust.name, number: cust.phone, qty: item.quantity,
          variant: item.variant || '', product: nama, timestamp: o.created_at, source: 'supabase'
        });
      }
    }
  } catch (e) {
    console.log('[Rekap] Supabase fetch error:', e.message);
  }

  // Merge by customer+variant
  const merged = new Map();
  for (const x of [...supaItems, ...localList]) {
    const phone = String(x.number || '').replace(/\\D/g, '').slice(-4);
    const v = (x.variant || '').trim().toLowerCase();
    const key = phone + '|' + v;
    if (merged.has(key)) {
      merged.get(key).qty += x.qty;
    } else {
      merged.set(key, { ...x });
    }
  }
  const list = [...merged.values()];

  if (list.length === 0) {
    return `≡ƒôï *REKAP ORDER*\\n${judul || ''}\\nBelum ada order untuk *${nama}*.`;
  }

  const full = (localList[0]?.productDesc || localList[0]?.product || nama);
  const unit = parseUnit(full);
  const per = full.match(/(\\d{1,3}(?:\\.\\d{3})+)\\s*\\/\\s*(\\d+)\\s*(set|pcs)/i);

  // Lookup stock_type for label
  let stockType = null;
  try {
    const { getApi } = require('./supabase.js');
    const api = await getApi();
    const { data: prodRow } = await api.from('products').select('stock_type').ilike('name', '%' + cleanName + '%').limit(1).maybeSingle();
    if (prodRow) stockType = prodRow.stock_type;
  } catch (e) { /* ignore */ }

  let out = `≡ƒôï *REKAP ORDER*\\n${judul || ''}\\n`;
  out += `${stockType === 'po' ? 'list po' : 'list ready'} *${nama}*`;
  if (per) {
    const hargaNominal = parseInt(per[1].replace(/\\./g, ''), 10);
    out += ` harga ${formatRupiah(hargaNominal)}/ ${per[2]} ${per[3].toLowerCase()}`;
  } else if (parsePrice(full)) {
    out += ` harga ${formatRupiah(parsePrice(full))}/ 1 ${unit}`;
  }
  out += `\\n`;

  if (unit === 'set') {
    const pcsSet = parsePcsPerSet(full);
    if (pcsSet) out += `1 set: ${pcsSet}pcs\\n`;
  }

  const groups = new Map();
  for (const x of list) {
    const v = ((x.variant || '').trim() || 'tanpa varian').toUpperCase();
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(x);
  }

  let totalAll = 0;
  for (const [v, items] of groups) {
    out += `\\n*${v}*\\n`;
    items.forEach((x, i) => {
      const last4 = String(x.number || '').slice(-4);
      const nomor = last4 ? ` -- ${last4}` : '';
      out += `${i + 1}. ${x.sender}${nomor} -- ${x.qty}\\n`;
    });
    const sub = items.reduce((s, x) => s + x.qty, 0);
    totalAll += sub;
    out += `subtotal: ${sub}\\n`;
  }

  out += `\\ntotal: ${totalAll} ${unit}\\n`;
  return out;
}
'''

code = code[:startIdx] + newFunc + code[endIdx:]
open('/opt/wa-bot/index.js', 'w', encoding='utf-8').write(code)
print('OK - replaced buatRekapProduk with Supabase version')
