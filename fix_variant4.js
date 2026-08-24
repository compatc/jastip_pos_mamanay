const fs = require('fs');
const f = '/opt/wa-bot/index.js';
let c = fs.readFileSync(f, 'utf8');

const oldMatch = `    const replyClean = text.trim().toLowerCase();
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

const newMatch = `    const replyClean = text.trim().toLowerCase();
    if (promoVariants.length > 0) {
      // Find ALL matching variants (exact, number-based, contains)
      let exactMatch = promoVariants.find(v => replyClean === v.toLowerCase());
      let numMatches = [];
      if (!exactMatch) {
        const replyNum = replyClean.replace(/[^0-9]/g, '');
        numMatches = promoVariants.filter(v => {
          const vNum = v.toLowerCase().replace(/[^0-9]/g, '');
          return vNum && replyNum && vNum === replyNum;
        });
      }
      let containsMatch = [];
      if (!exactMatch && numMatches.length === 0) {
        containsMatch = promoVariants.filter(v => replyClean.includes(v.toLowerCase()));
      }

      const allMatches = exactMatch ? [exactMatch] : (numMatches.length > 0 ? numMatches : containsMatch);

      if (allMatches.length === 1) {
        varian = allMatches[0];
      } else if (allMatches.length > 1) {
        // Multiple matches — ask user to clarify
        const listStr = allMatches.map(v => '• ' + v).join('\\n');
        await kirim(sock, chatId, 'Mau yang mana?\\n' + listStr);
        console.log('VARIANT AMBIGUOUS:', allMatches, 'variants:', promoVariants);
        return;
      }

      if (varian) {
        // Extract qty from words like "mau 2", "ambil 3", or standalone number that isn't the variant
        const variantNum = varian.replace(/[^0-9]/g, '');
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
  fs.writeFileSync(f, c, 'utf8');
  console.log('Updated! Variant ambiguity detection added.');
} else {
  console.log('Pattern not found. Manual edit needed.');
}
