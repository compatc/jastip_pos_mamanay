const fs = require('fs');
let c = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

const fnStart = c.indexOf('function parseQty(text)');
const fnEnd = c.indexOf('function hasOrderIntent');
if (fnStart === -1 || fnEnd === -1) { console.log('Functions not found'); process.exit(1); }

const newParseQty = `function parseQty(text) {
  // Priority 1: explicit qty with unit (e.g. "2 pcs", "3buah")
  const m1 = text.match(/\\b(\\d+)\\s*(pcs|buah)\\b/i);
  if (m1) return parseInt(m1[1], 10) || 1;
  // Priority 2: mau/tambah + number (e.g. "mau 2", "tambah 3")
  const m2 = text.match(/mau\\s*(\\d+)/i) || text.match(/tambah\\s*(\\d+)/i);
  if (m2) return parseInt(m2[1], 10) || 1;
  // Priority 3: number in parentheses (e.g. "(1)", "(2)")
  const m3 = text.match(/\\((\\d+)\\)/);
  if (m3) return parseInt(m3[1], 10) || 1;
  return 1;
}

`;

c = c.slice(0, fnStart) + newParseQty + c.slice(fnEnd);
fs.writeFileSync('/opt/wa-bot/index.js', c);
console.log('parseQty fixed. Lines:', c.split('\n').length);
