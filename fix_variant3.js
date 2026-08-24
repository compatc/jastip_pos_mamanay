const fs = require('fs');
const f = '/opt/wa-bot/index.js';
let c = fs.readFileSync(f, 'utf8');

// Fix 1: Improve parseVariantsFromPromo to handle multiple formats
const oldFn = `function parseVariantsFromPromo(promoText) {
  if (!promoText) return [];
  const variants = [];
  const lines = promoText.split('\\n');
  for (const line of lines) {
    const m = line.match(/\\u2022\\s*(.+?)\\s*\\[stok:\\d+\\]/i);
    if (m) variants.push(m[1].trim());
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
    if (m3 && !/^size:|^stok:|^harga|^💰|^◇|^\\\*/i.test(line.trim())) {
      variants.push(m3[1].trim());
    }
  }
  return variants;
}`;

if (c.includes(oldFn)) {
  c = c.replace(oldFn, newFn);
  console.log('1. Updated parseVariantsFromPromo');
} else {
  console.log('1. parseVariantsFromPromo not found (may already be updated)');
}

// Fix 2: Better variant matching - "Size 40 ka" should match variant "40"
const oldMatch = `    const replyClean = text.trim().toLowerCase();
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
    }`;

const newMatch = `    const replyClean = text.trim().toLowerCase();
    if (promoVariants.length > 0) {
      // Try exact match first, then partial match (e.g. "40" matches "40B")
      let matchedVariant = promoVariants.find(v => replyClean === v.toLowerCase());
      if (!matchedVariant) {
        // Try matching just the number part: "40" matches "40B", "pink 40" matches "pink 40B"
        const replyNum = replyClean.replace(/[^0-9]/g, '');
        matchedVariant = promoVariants.find(v => {
          const vNum = v.toLowerCase().replace(/[^0-9]/g, '');
          return vNum && replyNum && vNum === replyNum;
        });
      }
      if (!matchedVariant) {
        // Try if any variant name is contained in the reply
        matchedVariant = promoVariants.find(v => replyClean.includes(v.toLowerCase()));
      }
      if (matchedVariant) {
        varian = matchedVariant;
        // Extract qty from words like "mau 2", "ambil 3", or standalone number that isn't the variant
        const variantNum = matchedVariant.replace(/[^0-9]/g, '');
        const qtyWords = text.match(/(?:mau|ambil|pesan|beli|order|tambah)\\s*(\\d+)/i);
        if (qtyWords) {
          qty = parseInt(qtyWords[1], 10);
        } else {
          // Find all numbers in the text, pick the one that isn't the variant
          const allNums = [...text.matchAll(/\\d+/g)].map(m => m[0]);
          const otherNum = allNums.find(n => n !== variantNum);
          qty = otherNum ? parseInt(otherNum, 10) : 1;
        }
        console.log('VARIANT MATCH:', varian, 'qty:', qty, 'variants:', promoVariants);
      }
    }`;

if (c.includes(oldMatch)) {
  c = c.replace(oldMatch, newMatch);
  console.log('2. Updated variant matching logic');
} else {
  console.log('2. Variant matching not found (may already be updated)');
}

fs.writeFileSync(f, c, 'utf8');
console.log('3. Saved!');
