// patch_po_closed_v2.js — Fetch po_closed when promo is detected from group message
const fs = require('fs');
const FILE = '/opt/wa-bot/index.js';
let code = fs.readFileSync(FILE, 'utf8');

// After each promo detection, add async fetch for po_closed
const checkPattern = "        console.log('PROMO DETECTED (valid):', JSON.stringify(parsed));";
const checkReplace = `        console.log('PROMO DETECTED (valid):', JSON.stringify(parsed));
        fetchPoClosed(parsed.product);`;
if (code.includes(checkPattern) && !code.includes('fetchPoClosed(parsed.product)')) {
  code = code.replace(checkPattern, checkReplace);
  console.log('PATCH A: Added fetchPoClosed for valid promo');
} else {
  console.log('PATCH A: SKIPPED');
}

const checkPattern2 = "        console.log('PROMO DETECTED (tagged):', JSON.stringify(tagged));";
const checkReplace2 = `        console.log('PROMO DETECTED (tagged):', JSON.stringify(tagged));
        fetchPoClosed(tagged.product);`;
if (code.includes(checkPattern2) && !code.includes('fetchPoClosed(tagged.product)')) {
  code = code.replace(checkPattern2, checkReplace2);
  console.log('PATCH B: Added fetchPoClosed for tagged promo');
} else {
  console.log('PATCH B: SKIPPED');
}

// Add the fetchPoClosed function before the promo detection block
const funcInsert = `// Fetch po_closed status for a product from Supabase
function fetchPoClosed(productName) {
  const https = require('https');
  const url = 'https://mamanay.vercel.app/api/catalog-order';
  https.get(url, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try {
        const cat = JSON.parse(d);
        const prods = cat.data || [];
        const clean = productName.replace(/\\[.*?\\]/g, '').trim();
        const match = prods.find(p => p.name === productName || p.name === clean || p.name.includes(clean));
        if (match && match.po_closed) {
          currentPromo.po_closed = true;
          saveCurrentPromo();
          console.log('[PO CLOSED] Product is closed:', productName);
        } else {
          currentPromo.po_closed = false;
          saveCurrentPromo();
        }
      } catch(e) {}
    });
  }).on('error', () => {});
}

    if (isMine) {`;
if (!code.includes('fetchPoClosed(productName)')) {
  code = code.replace('    if (isMine) {', funcInsert + '\n    if (isMine) {');
  console.log('PATCH C: Added fetchPoClosed function');
} else {
  console.log('PATCH C: SKIPPED');
}

fs.writeFileSync(FILE, code);
console.log('Done.');
