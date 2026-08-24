const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

const marker = 'let promoStocks = loadPromoStocks();';

const replacement = `let promoStocks = loadPromoStocks();

// Auto-rebuild promoStocks from Supabase if empty
if (!promoStocks || Object.keys(promoStocks).length === 0) {
  console.log('[Stock] promoStocks empty, rebuilding from Supabase...');
  const https2 = require('https');
  https2.get('https://mamanay.vercel.app/api/catalog-order', (_res) => {
    let _d = '';
    _res.on('data', c => _d += c);
    _res.on('end', () => {
      try {
        const _cat = JSON.parse(_d);
        const _prods = _cat.data || _cat.products || [];
        for (const _p of _prods) {
          const _vars = _p.variants || [];
          if (_vars.length > 0) {
            for (const _v of _vars) {
              if (_p.stock_type !== 'po' && (_v.stock||0) > 0) {
                promoStocks[_p.name] = (promoStocks[_p.name] || 0) + _v.stock;
              }
            }
          } else {
            if (_p.stock_type !== 'po' && (_p.stock||0) > 0) {
              promoStocks[_p.name] = _p.stock;
            }
          }
        }
        savePromoStocks();
        console.log('[Stock] Rebuilt:', Object.keys(promoStocks).length, 'products');
      } catch(e) { console.error('[Stock] Rebuild failed:', e.message); }
    });
  }).on('error', e => console.error('[Stock] Rebuild fetch error:', e.message));
}`;

if (!code.includes('auto-rebuild promoStocks from Supabase')) {
  code = code.replace(marker, replacement);
  fs.writeFileSync(path, code);
  console.log('Patched! Auto-rebuild promoStocks on startup.');
} else {
  console.log('Already patched.');
}
