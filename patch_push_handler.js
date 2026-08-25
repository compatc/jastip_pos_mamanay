// patch_push_handler.js — Handle pushOrderToSupabase errors (po_closed)
const fs = require('fs');
const FILE = '/opt/wa-bot/index.js';
let code = fs.readFileSync(FILE, 'utf8');

// 1. Multi-variant: await and check result
const multiOld = "            pushOrderToSupabase(orderData);";
const multiNew = "            { const _r = await pushOrderToSupabase(orderData);\n              if (_r && _r.error && _r.error.includes('PO ditutup')) {\n                await kirim(sock, chatId, ' Mohon maaf, pesanan PO untuk *' + ov.product + '* sudah ditutup.');\n              } }";
if (code.includes(multiOld) && !code.includes('await pushOrderToSupabase(orderData)')) {
  code = code.replaceAll(multiOld, multiNew);
  console.log('PATCH 1: All pushOrderToSupabase calls now await + check PO closed');
} else {
  console.log('PATCH 1: SKIPPED');
}

// 2. Single-variant: also add await
const singleOld = "    pushOrderToSupabase(orderData);";
const singleNew = "    { const _r = await pushOrderToSupabase(orderData);\n      if (_r && _r.error && _r.error.includes('PO ditutup')) {\n        await kirim(sock, chatId, ' Mohon maaf, pesanan PO untuk *' + namaProduk + '* sudah ditutup.');\n        return;\n      }\n    }";
if (code.includes(singleOld) && !code.includes('await pushOrderToSupabase')) {
  code = code.replace(singleOld, singleNew);
  console.log('PATCH 2: Single-variant also patched');
} else {
  console.log('PATCH 2: SKIPPED (already patched)');
}

fs.writeFileSync(FILE, code);
console.log('Done.');
