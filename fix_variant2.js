const fs = require('fs');
const f = '/opt/wa-bot/index.js';
let c = fs.readFileSync(f, 'utf8');

const oldLogic = `    const qty = parseQty(text);
    const unitPrice = promo.price;
    const total = unitPrice * qty;
    const namaProduk = promo.product;
    const varian = parseVariant(text);`;

const newLogic = `    const namaProduk = promo.product;

    // Check if reply matches a variant name from the quoted promo
    let varian = parseVariant(text);
    let qty = parseQty(text);

    let promoVariants = [];
    if (ctx) {
      const qBody = extractQuotedText(ctx);
      promoVariants = parseVariantsFromPromo(qBody);
    }

    const replyClean = text.trim().toLowerCase();
    if (promoVariants.length > 0) {
      const matchedVariant = promoVariants.find(v => replyClean === v.toLowerCase());
      if (matchedVariant) {
        varian = matchedVariant;
        const qtyWords = text.match(/(?:mau|ambil|pesan|beli|order|tambah)\\s*(\\d+)/i);
        const numInText = text.match(/(\\d+)/);
        if (qtyWords) {
          qty = parseInt(qtyWords[1], 10);
        } else if (numInText && numInText[1] !== matchedVariant.replace(/\\D/g, '')) {
          qty = parseInt(numInText[1], 10);
        } else {
          qty = 1;
        }
        console.log('VARIANT MATCH:', varian, 'qty:', qty);
      }
    }

    const unitPrice = promo.price;
    const total = unitPrice * qty;`;

if (c.includes(oldLogic)) {
  c = c.replace(oldLogic, newLogic);
  console.log('Updated order logic with variant matching');
  fs.writeFileSync(f, c, 'utf8');
  console.log('Saved!');
} else {
  console.log('Still not found. Searching...');
  const idx = c.indexOf('const qty = parseQty(text);');
  if (idx >= 0) {
    console.log('Found at index:', idx);
    console.log('Context:', JSON.stringify(c.substring(idx, idx + 200)));
  } else {
    console.log('parseQty call not found');
  }
}
