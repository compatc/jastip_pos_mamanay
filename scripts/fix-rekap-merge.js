const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

const oldBlock = `  // Merge local + supabase, dedupe by sender+variant+qty+timestamp
  const seen = new Set();
  const allItems = [];
  for (const x of [...supaItems, ...localList]) {
    const ts = (x.timestamp || '').slice(0, 16);
    const phone = String(x.number || '').replace(/\\D/g, '').slice(-4);
    const key = phone + '|' + (x.variant || '').trim().toLowerCase() + '|' + x.qty + '|' + ts;
    if (!seen.has(key)) { seen.add(key); allItems.push(x); }
  }

  const list = allItems;`;

const newBlock = `  // Merge by customer+variant (sum qty across multiple orders)
  const merged = new Map();
  for (const x of [...supaItems, ...localList]) {
    const phone = String(x.number || '').replace(/\\D/g, '').slice(-4);
    const v = (x.variant || '').trim().toLowerCase();
    const key = phone + '|' + v;
    if (merged.has(key)) {
      const existing = merged.get(key);
      existing.qty += x.qty;
    } else {
      merged.set(key, { ...x });
    }
  }
  const list = [...merged.values()];`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  fs.writeFileSync('/opt/wa-bot/index.js', code);
  console.log('MERGE FIXED');
} else {
  console.log('NOT FOUND');
}
