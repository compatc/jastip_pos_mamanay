import { readFileSync, writeFileSync, existsSync } from 'fs';
const file = '/opt/wa-bot/index.js';
let code = readFileSync(file, 'utf8');

// 1. Add load/save functions for promoStocks
const stockUtils = `
// --- Promo Stocks Persistence ---
const PROMO_STOCKS_FILE = '/opt/wa-bot/promo-stocks.json';
function loadPromoStocks() {
  try {
    if (existsSync(PROMO_STOCKS_FILE)) {
      return JSON.parse(readFileSync(PROMO_STOCKS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}
function savePromoStocks() {
  try {
    writeFileSync(PROMO_STOCKS_FILE, JSON.stringify(promoStocks, null, 2));
  } catch (e) { console.error('Gagal save promoStocks:', e.message); }
}
`;

// Insert after promoStocks declaration
const oldDecl = "let promoStocks = {}; // { productName: remainingStock }";
const newDecl = "let promoStocks = loadPromoStocks();";
if (code.includes(oldDecl)) {
  code = code.replace(oldDecl, newDecl);
  code = code.replace(/^(let promoStocks.*)$/m, stockUtils + '\n' + newDecl);
}

// 2. Add savePromoStocks() after each stock change
// After STOCK SET
const oldSet = "console.log('STOCK SET:', parsed.product, '=', parsed.stock);";
const newSet = "console.log('STOCK SET:', parsed.product, '=', parsed.stock);\n          savePromoStocks();";
code = code.replaceAll(oldSet, newSet);

const oldSetTagged = "console.log('STOCK SET:', tagged.product, '=', tagged.stock);";
const newSetTagged = "console.log('STOCK SET:', tagged.product, '=', tagged.stock);\n          savePromoStocks();";
code = code.replaceAll(oldSetTagged, newSetTagged);

// After STOCK DEDUCTED
const oldDeduct = "console.log('STOCK DEDUCTED:', namaProduk, '=', promoStocks[namaProduk]);";
const newDeduct = "console.log('STOCK DEDUCTED:', namaProduk, '=', promoStocks[namaProduk]);\n      savePromoStocks();";
code = code.replaceAll(oldDeduct, newDeduct);

writeFileSync(file, code, 'utf8');
console.log('Done! promoStocks will persist across restarts.');
