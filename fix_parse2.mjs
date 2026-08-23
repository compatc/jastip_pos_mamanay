import { readFileSync, writeFileSync } from 'fs';
const file = '/opt/wa-bot/index.js';
let code = readFileSync(file, 'utf8');

const oldFn = `  if (!name || price <= 0) return null;
  return { product: name, price };
}

function getOrderKey(o) {`;

const newFn = `  if (!name || price <= 0) return null;
  const stockMatch = text.match(/📦\\s*[Ss]tok\\s*:\\s*(\\d+)/);
  const stock = stockMatch ? parseInt(stockMatch[1], 10) : null;
  return { product: name, price, stock };
}

function getOrderKey(o) {`;

if (code.includes(oldFn)) {
  code = code.replace(oldFn, newFn);
  writeFileSync(file, code, 'utf8');
  console.log('Fixed parseTagged - stock parsing added');
} else {
  console.log('Pattern not found');
}
