const fs = require('fs');
const https = require('https');
const http = require('http');

const VERCEL_URL = process.env.VERCEL_URL || 'https://mamanay.vercel.app';
const PROMO_FILE = '/opt/wa-bot/current-promo.json';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function rebuildCurrentPromo(productName) {
  try {
    const catalog = await fetchJson(VERCEL_URL + '/api/catalog-order');
    const products = catalog.data || catalog.products || [];

    let product;
    if (productName) {
      product = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
    }
    if (!product && products.length > 0) {
      product = products.sort((a, b) => b.sell_price - a.sell_price)[0];
    }
    if (!product) {
      console.log('No products found');
      return null;
    }

    const variants = product.variants || [];

    let promoMsg = '\uD83C\uDFF7\uFE0F ' + product.name;
    if (product.stock_type === 'po') promoMsg += ' [PO]';
    promoMsg += ' ' + (product.sell_price || 0).toLocaleString('id-ID');

    if (variants.length > 0) {
      for (const v of variants) {
        const stock = v.stock || 0;
        promoMsg += '\n\u2022 ' + v.name;
        if (product.stock_type !== 'po' && stock > 0) {
          promoMsg += ' [stok:' + stock + ']';
        }
      }
    }
    promoMsg += '\n_Fix, reply difoto_';

    const promo = {
      product: product.name,
      price: product.sell_price || 0,
      message: promoMsg,
      sender: 'Admin',
      senderLid: '',
      waktu: new Date().toLocaleString('id-ID'),
      msgId: '',
      source: 'rebuild-from-supabase'
    };

    fs.writeFileSync(PROMO_FILE, JSON.stringify(promo, null, 2));
    console.log('currentPromo rebuilt:');
    console.log('  Product:', promo.product);
    console.log('  Price:', promo.price);
    console.log('  Variants:', variants.length);
    console.log('  Message:\n' + promoMsg);
    return promo;
  } catch (e) {
    console.error('Rebuild failed:', e.message);
    return null;
  }
}

const productName = process.argv[2] || null;
rebuildCurrentPromo(productName).then(() => process.exit(0));
