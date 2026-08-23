import { readFileSync, writeFileSync } from 'fs';
const file = '/opt/wa-bot/index.js';
let code = readFileSync(file, 'utf8');

// Fix parsePromoStructured - add stock parsing
const oldFn = `  return { product: name, price };
}

function parseTagged(text) {`;

const newFn = `  const stockMatch = text.match(/🏷️\\s*[Ss]tok\\s*:\\s*(\\d+)/);
  const stock = stockMatch ? parseInt(stockMatch[1], 10) : null;
  return { product: name, price, stock };
}

function parseTagged(text) {`;

if (code.includes(oldFn)) {
  code = code.replace(oldFn, newFn);
  writeFileSync(file, code, 'utf8');
  console.log('Fixed parsePromoStructured');
} else {
  console.log('Pattern not found, checking current state...');
  // Show current state around the function
  const idx = code.indexOf('function parsePromoStructured');
  if (idx >= 0) {
    console.log(code.substring(idx, idx + 400));
  }
}
