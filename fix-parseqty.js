const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

// Replace parseQty function
const oldFn = `function parseQty(text) {
  const m = text.match(/\\b(\\d+)\\s*(pcs|buah)\\b/i) || text.match(/mau\\s*(\\d+)/i) || text.match(/tambah\\s*(\\d+)/i) || text.match(/\\b(\\d+)\\s*(pcs|buah|kak|bang|dong|ya)?\\b/i);
  if (m) return parseInt(m[1], 10) || 1;
  return 1;
}`;

const newFn = `function parseQty(text) {
  // Priority 1: explicit qty with unit (e.g. "2 pcs", "3buah")
  const m1 = text.match(/\\b(\\d+)\\s*(pcs|buah)\\b/i);
  if (m1) return parseInt(m1[1], 10) || 1;
  // Priority 2: mau/tambah + number (e.g. "mau 2", "tambah 3")
  const m2 = text.match(/mau\\s*(\\d+)/i) || text.match(/tambah\\s*(\\d+)/i);
  if (m2) return parseInt(m2[1], 10) || 1;
  // Priority 3: number in parentheses (e.g. "(1)", "(2)")
  const m3 = text.match(/\\((\\d+)\\)/);
  if (m3) return parseInt(m3[1], 10) || 1;
  // Priority 4: number after stop words like "satu", "1", etc
  const m4 = text.match(/\\b(satu|sebuah|1)\\b/i);
  if (m4) return 1;
  return 1;
}`;

if (code.includes('function parseQty(text)')) {
  // Find and replace the function
  const fnStart = code.indexOf('function parseQty(text)');
  if (fnStart > -1) {
    // Find the end of the function (next function or closing brace at same level)
    let braceCount = 0;
    let fnEnd = fnStart;
    let started = false;
    for (let i = fnStart; i < code.length; i++) {
      if (code[i] === '{') { braceCount++; started = true; }
      if (code[i] === '}') { braceCount--; }
      if (started && braceCount === 0) { fnEnd = i + 1; break; }
    }
    code = code.slice(0, fnStart) + newFn + code.slice(fnEnd);
    fs.writeFileSync('/opt/wa-bot/index.js', code);
    console.log('parseQty replaced. Lines:', code.split('\\n').length);
  }
} else {
  console.log('parseQty not found');
}
