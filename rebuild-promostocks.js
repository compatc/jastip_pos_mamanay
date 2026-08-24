const fs = require('fs');
const https = require('https');

const PROMO_STOCKS_FILE = '/opt/wa-bot/promo-stocks.json';
const VERCEL_URL = 'https://mamanay.vercel.app';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function rebuildPromoStocks() {
  try {
    const catalog = await fetchJson(VERCEL_URL + '/api/catalog-order');
    const products = catalog.data || catalog.products || [];

    const promoStocks = {};
    for (const p of products) {
      const name = p.name;
      const variants = p.variants || [];

      if (variants.length > 0) {
        // Products with variants: sum variant stock, per variant
        for (const v of variants) {
          const stock = v.stock || 0;
          // Only track ready stock (not PO)
          if (p.stock_type !== 'po' && stock > 0) {
            promoStocks[name] = (promoStocks[name] || 0) + stock;
          }
        }
      } else {
        // No variants: use product stock directly
        const stock = p.stock || 0;
        if (p.stock_type !== 'po' && stock > 0) {
          promoStocks[name] = stock;
        }
      }
    }

    fs.writeFileSync(PROMO_STOCKS_FILE, JSON.stringify(promoStocks, null, 2));
    console.log('promoStocks rebuilt from Supabase:');
    console.log('  Products tracked:', Object.keys(promoStocks).length);
    for (const [name, stock] of Object.entries(promoStocks)) {
      console.log('  -', name, ':', stock);
    }
    return promoStocks;
  } catch (e) {
    console.error('Rebuild failed:', e.message);
    return null;
  }
}

rebuildPromoStocks().then(() => process.exit(0));
