const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

// 1. PO products skip stock check
const stockCheckOld = `    // Cek stok sebelum simpan order
    const currentStock = promoStocks[namaProduk];
    if (currentStock !== null && currentStock !== undefined) {
      const existingOrder = orders.find((o) => getOrderKey(o) === getOrderKey(orderData));
      const alreadyOrdered = existingOrder ? existingOrder.qty : 0;
      const available = currentStock - alreadyOrdered;
      if (available <= 0) {
        console.log('STOK HABIS:', namaProduk);
        await kirim(sock, chatId, ' Mohon maaf, stok *' + namaProduk + '* sudah habis.');
        return;
      }
      if (qty > available) {
        console.log('STOK KURANG:', namaProduk, 'sisa', available);
        await kirim(sock, chatId, ' Stok *' + namaProduk + '* tinggal ' + available + ' pcs. Apakah mau ' + available + ' pcs?');
        return;
      }
    }`;

const stockCheckNew = `    // Cek stok sebelum simpan order (skip untuk PO)
    const isPO = currentPromo && currentPromo.product && currentPromo.product.includes('[PO]');
    if (!isPO) {
      const currentStock = promoStocks[namaProduk];
      if (currentStock !== null && currentStock !== undefined) {
        const existingOrder = orders.find((o) => getOrderKey(o) === getOrderKey(orderData));
        const alreadyOrdered = existingOrder ? existingOrder.qty : 0;
        const available = currentStock - alreadyOrdered;
        if (available <= 0) {
          console.log('STOK HABIS:', namaProduk);
          await kirim(sock, chatId, ' Mohon maaf, stok *' + namaProduk + '* sudah habis.');
          return;
        }
        if (qty > available) {
          console.log('STOK KURANG:', namaProduk, 'sisa', available);
          await kirim(sock, chatId, ' Stok *' + namaProduk + '* tinggal ' + available + ' pcs. Apakah mau ' + available + ' pcs?');
          return;
        }
      }
    }`;

if (code.includes(stockCheckOld)) {
  code = code.replace(stockCheckOld, stockCheckNew);
  console.log('1. Fixed: PO products skip stock check');
} else {
  console.log('1. SKIP — stock check not found');
}

// 2. Rekap order: add order_type filter for penjualan
const rekapOld = `function buatRekapProduk(nama, judul) {
  const list = orders.filter((o) => {
    const onama = ((o.product || o.productDesc || '').split('\\n')[0].trim()) || '(tanpa produk)';
    return onama === nama;
  });`;

const rekapNew = `function buatRekapProduk(nama, judul) {
  const list = orders.filter((o) => {
    const onama = ((o.product || o.productDesc || '').split('\\n')[0].trim()) || '(tanpa produk)';
    const isPenjualan = !o.orderType || o.orderType === 'penjualan';
    return onama === nama && isPenjualan;
  });`;

if (code.includes(rekapOld)) {
  code = code.replace(rekapOld, rekapNew);
  console.log('2. Fixed: rekap order only penjualan');
} else {
  console.log('2. SKIP — rekap function not found');
}

fs.writeFileSync(path, code);
console.log('Done!');
