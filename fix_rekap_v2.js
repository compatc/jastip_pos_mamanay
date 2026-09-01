const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

// 1. Add "po", "ready" to VARIANT_STOP
const oldStop = "const VARIANT_STOP = /^(kak|ka|kaa|kk|kakak|bang|mbak|mbk|mimin|sis|sist|dong|ya|yah|yh|deh|pls|pcs|buah|set|mau+|beli|ambil|pesan|order|tambah|minat|ingin|pingin|pengen|saya|aku|min|bro|admin|sama|lagi|boleh|bisa|neng|teteh|juga|jg|jgaaa)$/i;";
const newStop = "const VARIANT_STOP = /^(kak|ka|kaa|kk|kakak|bang|mbak|mbk|mimin|sis|sist|dong|ya|yah|yh|deh|pls|pcs|buah|set|mau+|beli|ambil|pesan|order|tambah|minat|ingin|pingin|pengen|saya|aku|min|bro|admin|sama|lagi|boleh|bisa|neng|teteh|juga|jg|jgaaa|po|ready)$/i;";

if (code.includes('|po|ready') || code.includes('|po|ready|')) {
  console.log('ALREADY HAS po/ready in VARIANT_STOP');
} else {
  code = code.replace(oldStop, newStop);
  console.log('Added po/ready to VARIANT_STOP');
}

// 2. Fix rekap: strip [PO] and [Ready] from nama before query
const oldRekap = `    return onama === nama && isPenjualan && !o.pushed;`;
const newRekap = `    // Strip [PO], [Ready] etc. from both sides for comparison\n    const normName = (s) => s.replace(/\\[.*?\\]|\\b(ready|readyh|po)\\b/gi, '').replace(/\\s+/g, ' ').trim().toLowerCase();\n    return normName(onama) === normName(nama) && isPenjualan && !o.pushed;`;

if (code.includes('normName(onama) === normName(nama)')) {
  console.log('ALREADY HAS normalized rekap comparison');
} else {
  code = code.replace(oldRekap, newRekap);
  console.log('Fixed local rekap comparison to normalize names');
}

// 3. Fix Supabase rekap: strip [PO]/[Ready] from exact match too
const oldExact = "      .eq('product_name', nama);";
const newExact = "      .ilike('product_name', '%' + cleanName + '%');";

// Only replace the FIRST occurrence in buatRekapProduk (the exact match query)
// Find the exact match line after 'const { data: exactData }'
const exactIdx = code.indexOf("const { data: exactData } = await api.from('order_items')");
if (exactIdx > -1) {
  const exactEnd = code.indexOf(".eq('product_name', nama);", exactIdx);
  if (exactEnd > -1 && !code.substring(exactIdx, exactEnd + 30).includes('ilike')) {
    code = code.substring(0, exactEnd) + ".ilike('product_name', '%' + cleanName + '%');" + code.substring(exactEnd + ".eq('product_name', nama);".length);
    console.log('Fixed Supabase exact match to use ilike with cleanName');
  } else {
    console.log('Supabase exact match already uses ilike or pattern not found');
  }
}

fs.writeFileSync('/opt/wa-bot/index.js', code);
console.log('DONE');
