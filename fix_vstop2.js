const fs = require('fs');
const f = '/opt/wa-bot/index.js';
let c = fs.readFileSync(f, 'utf8');

const oldFn = `function parseVariantsFromPromo(promoText) {
  if (!promoText) return [];
  const variants = [];
  const lines = promoText.split('\\n');
  for (const line of lines) {
    // Format 1: • Name [stok:5]
    const m1 = line.match(/\\u2022\\s*(.+?)\\s*\\[stok:\\d+\\]/i);
    if (m1) { variants.push(m1[1].trim()); continue; }
    // Format 2: Name (1) or Name(1) — parenthetical stock count
    const m2 = line.match(/^\\s*[-•]?\\s*(.+?)\\s*\\(\\d+\\)\\s*$/i);
    if (m2) { variants.push(m2[1].trim()); continue; }
    // Format 3: just a name on its own line under "size:" header
    const m3 = line.match(/^\\s*[-•]?\\s*([a-zA-Z0-9\\/]+(?:\\s+[a-zA-Z0-9\\/]+)*)\\s*$/i);
    if (m3 && !/^size:|^stok:|^harga|^💰|^◇|^\\*/i.test(line.trim())) {
      variants.push(m3[1].trim());
    }
  }
  return variants;
}`;

const newFn = `function parseVariantsFromPromo(promoText) {
  if (!promoText) return [];
  const variants = [];
  const lines = promoText.split('\\n');
  for (const line of lines) {
    // Format 1: • Name [stok:5]
    const m1 = line.match(/\\u2022\\s*(.+?)\\s*\\[stok:\\d+\\]/i);
    if (m1) { variants.push(m1[1].trim()); continue; }
    // Format 2: Name (1) or Name(1) — parenthetical stock count
    const m2 = line.match(/^\\s*[-•]?\\s*(.+?)\\s*\\(\\d+\\)\\s*$/i);
    if (m2) { variants.push(m2[1].trim()); continue; }
    // Format 3: just a name on its own line under "size:" header
    const m3 = line.match(/^\\s*[-•]?\\s*([a-zA-Z0-9\\/]+(?:\\s+[a-zA-Z0-9\\/]+)*)\\s*$/i);
    if (m3 && !/^size:|^stok:|^harga|^💰|^◇|^\\*/i.test(line.trim())) {
      variants.push(m3[1].trim());
    }
  }
  // Filter out stop words (kak, bu, mau, dll)
  return variants.filter(v => !VARIANT_STOP.test(v));
}`;

if (c.includes(oldFn)) {
  c = c.replace(oldFn, newFn);
  fs.writeFileSync(f, c, 'utf8');
  console.log('Updated parseVariantsFromPromo');
} else {
  console.log('parseVariantsFromPromo not found');
}
