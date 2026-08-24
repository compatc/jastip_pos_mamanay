// Fix: Parse variant names from quoted promo, treat matching reply as variant not quantity
// Apply to /opt/wa-bot/index.js

const fs = require('fs');
const file = '/opt/wa-bot/index.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Add parseVariantsFromPromo function after parseTagged
const fnInsert = `
function parseVariantsFromPromo(promoText) {
  if (!promoText) return [];
  const variants = [];
  const lines = promoText.split('\\n');
  for (const line of lines) {
    const m = line.match(/•\\s*(.+?)\\s*\\[stok:\\d+\\]/i);
    if (m) variants.push(m[1].trim());
  }
  return variants;
}
`;

// Insert after getOrderKey function
if (!code.includes('parseVariantsFromPromo')) {
  code = code.replace(
    "function getOrderKey(o) {",
    fnInsert + "\nfunction getOrderKey(o) {"
  );
  console.log('Added parseVariantsFromPromo function');
}

// 2. In the order processing section, after parseQty and parseVariant,
//    check if reply text matches a variant name from the quoted promo
// Find the line: const varian = parseVariant(text);
// and replace the logic

const oldOrderLogic = `      const qty = parseQty(text);
      const unitPrice = promo.price;
      const total = unitPrice * qty;
      const namaProduk = promo.product;
      const varian = parseVariant(text);`;

const newOrderLogic = `      const namaProduk = promo.product;
      
      // Check if reply matches a variant name from the quoted promo
      let varian = parseVariant(text);
      let qty = parseQty(text);
      
      // If we have a quoted promo message, parse its variant names
      let promoVariants = [];
      if (ctx) {
        const qBody = extractQuotedText(ctx);
        promoVariants = parseVariantsFromPromo(qBody);
      }
      
      // If reply text matches a variant name from the promo, treat it as variant
      const replyClean = text.trim().toLowerCase();
      if (promoVariants.length > 0) {
        const matchedVariant = promoVariants.find(v => replyClean === v.toLowerCase());
        if (matchedVariant) {
          varian = matchedVariant;
          // If the reply IS the variant name (no separate qty), default qty to 1
          // Check if there's a separate number for qty
          const qtyMatch = text.match(/(?:mau|ambil|pesan|beli|order|tambah)?\\s*(\\d+)/i);
          const possibleQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
          // If possibleQty equals the variant number itself, qty is 1
          if (String(possibleQty) === replyClean.replace(/[^\\d]/g, '')) {
            qty = 1;
          } else {
            qty = possibleQty;
          }
          console.log('VARIANT MATCH:', varian, 'qty:', qty);
        }
      }
      
      const unitPrice = promo.price;
      const total = unitPrice * qty;`;

if (code.includes(oldOrderLogic)) {
  code = code.replace(oldOrderLogic, newOrderLogic);
  console.log('Updated order logic with variant matching');
} else {
  console.log('WARNING: Could not find old order logic to replace');
}

fs.writeFileSync(file, code, 'utf8');
console.log('Done! Restart bot with: pm2 restart wa-bot');
