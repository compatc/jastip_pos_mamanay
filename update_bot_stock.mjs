import { readFileSync, writeFileSync } from 'fs';
const file = '/opt/wa-bot/index.js';
let code = readFileSync(file, 'utf8');

// 1. Add stock parsing to parsePromoStructured
const oldParse = `function parsePromoStructured(text) {
  if (!text) return null;
  const star = text.match(/⭐\\s*([^⭐]+?)\\s*⭐/);
  const money = text.match(/💰\\s*([\\d.,\\s]+?)\\s*💰/);
  if (!star || !money) return null;
  const name = star[1].replace(/\\s+/g, ' ').trim();
  const price = parseInt(String(money[1]).replace(/[^\\d]/g, ''), 10) || 0;
  if (!name || price <= 0) return null;
  return { product: name, price };
}`;

const newParse = `function parsePromoStructured(text) {
  if (!text) return null;
  const star = text.match(/⭐\\s*([^⭐]+?)\\s*⭐/);
  const money = text.match(/💰\\s*([\\d.,\\s]+?)\\s*💰/);
  if (!star || !money) return null;
  const name = star[1].replace(/\\s+/g, ' ').trim();
  const price = parseInt(String(money[1]).replace(/[^\\d]/g, ''), 10) || 0;
  if (!name || price <= 0) return null;
  const stockMatch = text.match(/🏷️\\s*[Ss]tok\\s*:\\s*(\\d+)/);
  const stock = stockMatch ? parseInt(stockMatch[1], 10) : null;
  return { product: name, price, stock };
}`;

code = code.replace(oldParse, newParse);

// 2. Add promoStocks variable after currentPromo
const oldPromoVar = "let currentPromo = { product: '', price: '', sender: '', waktu: '', msgId: '' };";
const newPromoVar = `let currentPromo = { product: '', price: '', sender: '', waktu: '', msgId: '' };
let promoStocks = {}; // { productName: remainingStock }`;

code = code.replace(oldPromoVar, newPromoVar);

// 3. Update currentPromo assignment to include stock from parsePromoStructured
const oldPromoDetected = `if (parsed) {
        currentPromo = { ...parsed, sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };
        console.log('PROMO DETECTED (valid):', JSON.stringify(parsed));`;

const newPromoDetected = `if (parsed) {
        currentPromo = { ...parsed, sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };
        if (parsed.stock !== null && parsed.stock !== undefined) {
          promoStocks[parsed.product] = parsed.stock;
          console.log('STOCK SET:', parsed.product, '=', parsed.stock);
        }
        console.log('PROMO DETECTED (valid):', JSON.stringify(parsed));`;

code = code.replace(oldPromoDetected, newPromoDetected);

// 4. Add stock check + deduction before order is saved
const oldOrderSave = `const isTambah = text.toLowerCase().includes('tambah');

    const existingIdx = orders.findIndex((o) => getOrderKey(o) === getOrderKey(orderData));
    if (existingIdx >= 0) {
      const existing = orders[existingIdx];
      const newQty = existing.qty + orderData.qty;
      orders[existingIdx] = { ...existing, qty: newQty, total: newQty * (existing.hargaSatuan || 0), jam: orderData.jam, timestamp: orderData.timestamp };
    } else {
      orders.push(orderData);
    }
    saveOrders();`;

const newOrderSave = `const isTambah = text.toLowerCase().includes('tambah');

    // Cek stok sebelum simpan order
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

    const existingIdx = orders.findIndex((o) => getOrderKey(o) === getOrderKey(orderData));
    if (existingIdx >= 0) {
      const existing = orders[existingIdx];
      const newQty = existing.qty + orderData.qty;
      orders[existingIdx] = { ...existing, qty: newQty, total: newQty * (existing.hargaSatuan || 0), jam: orderData.jam, timestamp: orderData.timestamp };
    } else {
      orders.push(orderData);
    }

    // Kurangi stok
    if (promoStocks[namaProduk] !== null && promoStocks[namaProduk] !== undefined) {
      promoStocks[namaProduk] -= qty;
      console.log('STOCK DEDUCTED:', namaProduk, '=', promoStocks[namaProduk]);
    }

    saveOrders();`;

code = code.replace(oldOrderSave, newOrderSave);

writeFileSync(file, code, 'utf8');
console.log('Done! File updated.');
