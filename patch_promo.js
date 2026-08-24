const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

const marker = 'let currentPromo = loadCurrentPromo();';

const replacement = `let currentPromo = loadCurrentPromo();

// Auto-rebuild currentPromo from Supabase if missing
if (!currentPromo || !currentPromo.product) {
  console.log('[Promo] currentPromo empty, rebuilding from Supabase...');
  const https = require('https');
  const _fetchUrl = 'https://mamanay.vercel.app/api/catalog-order';
  https.get(_fetchUrl, (_res) => {
    let _d = '';
    _res.on('data', c => _d += c);
    _res.on('end', () => {
      try {
        const _cat = JSON.parse(_d);
        const _prods = (_cat.data || _cat.products || []).sort((a,b) => (b.sell_price||0) - (a.sell_price||0));
        if (_prods.length > 0) {
          const _p = _prods[0];
          let _msg = '\\u{1F3F7}\\uFE0F ' + _p.name;
          if (_p.stock_type === 'po') _msg += ' [PO]';
          _msg += ' ' + (_p.sell_price||0).toLocaleString('id-ID');
          const _vars = _p.variants || [];
          if (_vars.length > 0) {
            for (const _v of _vars) {
              _msg += '\\n\\u2022 ' + _v.name;
              if (_p.stock_type !== 'po' && (_v.stock||0) > 0) _msg += ' [stok:' + _v.stock + ']';
            }
          }
          _msg += '\\n_Fix, reply difoto_';
          currentPromo = { product: _p.name, price: _p.sell_price||0, message: _msg, sender: 'Admin', senderLid: '', waktu: new Date().toLocaleString('id-ID'), msgId: '', source: 'auto-rebuild' };
          saveCurrentPromo();
          console.log('[Promo] Rebuilt:', _p.name, '|', _vars.length, 'variants');
        }
      } catch(e) { console.error('[Promo] Rebuild failed:', e.message); }
    });
  }).on('error', e => console.error('[Promo] Rebuild fetch error:', e.message));
}`;

if (!code.includes('auto-rebuild currentPromo from Supabase')) {
  code = code.replace(marker, replacement);
  fs.writeFileSync(path, code);
  console.log('Patched! Auto-rebuild currentPromo on startup.');
} else {
  console.log('Already patched.');
}
