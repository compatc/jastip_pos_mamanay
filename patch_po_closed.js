// patch_po_closed.js — Adds po_closed check to bot
const fs = require('fs');
const FILE = '/opt/wa-bot/index.js';
let code = fs.readFileSync(FILE, 'utf8');

// 1. Add po_closed to currentPromo when rebuilding from Supabase
const rebuildOld = "currentPromo = { product: _p.name, price: _p.sell_price||0, message: _msg, sender: 'Admin', senderLid: '', waktu: new Date().toLocaleString('id-ID'), msgId: '', source: 'auto-rebuild' };";
const rebuildNew = "currentPromo = { product: _p.name, price: _p.sell_price||0, message: _msg, sender: 'Admin', senderLid: '', waktu: new Date().toLocaleString('id-ID'), msgId: '', source: 'auto-rebuild', po_closed: !!_p.po_closed };";
if (code.includes(rebuildOld)) {
  code = code.replace(rebuildOld, rebuildNew);
  console.log('PATCH 1: Added po_closed to auto-rebuild currentPromo');
} else {
  console.log('PATCH 1: SKIPPED (already patched or pattern not found)');
}

// 2. Add po_closed check before order creation (before "Cek stok sebelum simpan order")
const stockCheckOld = "    // Cek stok sebelum simpan order (skip untuk PO)";
const poClosedCheck = `    // Cek PO ditutup
    const isPoClosed = currentPromo && currentPromo.po_closed;
    if (isPoClosed) {
      console.log('PO DITUTUP:', namaProduk);
      await kirim(sock, chatId, ' Mohon maaf, pesanan PO untuk *' + namaProduk + '* sudah ditutup.');
      return;
    }

    ${stockCheckOld}`;
if (code.includes(stockCheckOld) && !code.includes('isPoClosed')) {
  code = code.replace(stockCheckOld, poClosedCheck);
  console.log('PATCH 2: Added po_closed check before stock check');
} else {
  console.log('PATCH 2: SKIPPED (already patched or pattern not found)');
}

// 3. Add po_closed check in multi-variant order block too
const multiOld = "            const isPO2 = currentPromo && currentPromo.product && currentPromo.product.includes('[PO]');";
const multiNew = `            const isPoClosed2 = currentPromo && currentPromo.po_closed;
            if (isPoClosed2) {
              console.log('PO DITUTUP (multi):', namaProduk);
              await kirim(sock, chatId, ' Mohon maaf, pesanan PO untuk *' + namaProduk + '* sudah ditutup.');
              continue;
            }
            const isPO2 = currentPromo && currentPromo.product && currentPromo.product.includes('[PO]');`;
if (code.includes(multiOld) && !code.includes('isPoClosed2')) {
  code = code.replace(multiOld, multiNew);
  console.log('PATCH 3: Added po_closed check in multi-variant block');
} else {
  console.log('PATCH 3: SKIPPED (already patched or pattern not found)');
}

fs.writeFileSync(FILE, code);
console.log('Done. Restart PM2 to apply.');
