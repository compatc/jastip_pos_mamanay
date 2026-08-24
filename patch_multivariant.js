const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

// Find the VARIANT AMBIGUOUS block and replace with multi-variant handling
const oldBlock = `      const allMatches = exactMatch ? [exactMatch] : (numMatches.length > 0 ? numMatches : containsMatch);

      if (allMatches.length === 1) {
        varian = allMatches[0];
      } else if (allMatches.length > 1) {
        // Multiple matches — ask user to clarify
        const listStr = allMatches.map(v => '• ' + v).join('\\n');
        await kirim(sock, chatId, 'Mau yang mana?\\n' + listStr);
        console.log('VARIANT AMBIGUOUS:', allMatches, 'variants:', promoVariants);
        return;
      }
      // Auto-assign jika promo cuma 1 varian
      if (allMatches.length === 0 && promoVariants.length === 1 && hasOrderIntent(text)) {
        varian = promoVariants[0];
        console.log('AUTO-ASSIGN SINGLE VARIANT:', varian);
      }

      if (varian) {
        // Extract qty from words like "mau 2", "ambil 3", or standalone number that isn't the variant
        const variantNum = varian.replace(/[^0-9]/g, '');
        const qtyWords = text.match(/(?:mau|ambil|pesan|beli|order|tambah)\\s*(\\d+)/i);
        if (qtyWords) {
          qty = parseInt(qtyWords[1], 10);
        } else {
          // Find all numbers in the text, pick the one that isn't the variant
          const allNums = [...text.matchAll(/\\d+/g)].map(m => m[0]);
          const otherNum = allNums.find(n => n !== variantNum);
          qty = otherNum ? parseInt(otherNum, 10) : 1;
        }
        console.log('VARIANT MATCH:', varian, 'qty:', qty, 'variants:', promoVariants);
      }
    }`;

const newBlock = `      const allMatches = exactMatch ? [exactMatch] : (numMatches.length > 0 ? numMatches : containsMatch);

      // Auto-assign jika promo cuma 1 varian
      if (allMatches.length === 0 && promoVariants.length === 1 && hasOrderIntent(text)) {
        varian = promoVariants[0];
        allMatches.push(varian);
        console.log('AUTO-ASSIGN SINGLE VARIANT:', varian);
      }

      // Multi-variant: parse per baris (e.g. "pink 1\\nrose gold 1")
      if (allMatches.length > 1 || text.includes('\\n')) {
        const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
        const orders = [];
        for (const line of lines) {
          const lineLower = line.toLowerCase();
          const match = promoVariants.find(v => lineLower.includes(v.toLowerCase()));
          if (match) {
            const qMatch = line.match(/(\\d+)/);
            const lineQty = qMatch ? parseInt(qMatch[1], 10) : 1;
            orders.push({ variant: match, qty: lineQty });
          }
        }
        if (orders.length > 1) {
          console.log('MULTI-VARIANT ORDER:', orders);
          let sentRekap = false;
          for (const ov of orders) {
            const unitPrice = promo.price;
            const orderData = {
              tanggal: new Date().toLocaleDateString('id-ID'),
              jam: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              sender: senderName, number: senderNumber,
              product: namaProduk, variant: ov.variant,
              productDesc: '⭐' + namaProduk + '⭐\\n💰' + unitPrice.toLocaleString('id-ID') + '💰',
              promoMsgId: promo.promoMsgId,
              qty: ov.qty, hargaSatuan: unitPrice, total: unitPrice * ov.qty,
              message: text, group: chatId, timestamp: new Date().toISOString()
            };
            const isPO2 = currentPromo && currentPromo.product && currentPromo.product.includes('[PO]');
            if (!isPO2 && promoStocks[namaProduk] !== null && promoStocks[namaProduk] !== undefined) {
              promoStocks[namaProduk] -= ov.qty;
              savePromoStocks();
            }
            const existIdx = orders_arr.findIndex((o) => getOrderKey(o) === getOrderKey(orderData));
            if (existIdx >= 0) {
              orders_arr[existIdx].qty += ov.qty;
              orders_arr[existIdx].total = orders_arr[existIdx].qty * (orders_arr[existIdx].hargaSatuan || 0);
            } else {
              orders_arr.push(orderData);
            }
            saveOrders();
            console.log('ORDER SAVED (multi):', ov.variant, 'x' + ov.qty);
            if (N8N_WEBHOOK_URL) sendToWebhook(orderData);
            sendToWebApi(orderData);
            pushOrderToSupabase(orderData);
          }
          const rekap = await buatRekapProduk(namaProduk, 'Order baru:');
          await kirim(sock, chatId, rekap);
          return;
        }
      }

      if (allMatches.length === 1) {
        varian = allMatches[0];
      } else if (allMatches.length > 1) {
        const listStr = allMatches.map(v => '• ' + v).join('\\n');
        await kirim(sock, chatId, 'Mau yang mana?\\n' + listStr);
        console.log('VARIANT AMBIGUOUS:', allMatches, 'variants:', promoVariants);
        return;
      }

      if (varian) {
        const variantNum = varian.replace(/[^0-9]/g, '');
        const qtyWords = text.match(/(?:mau|ambil|pesan|beli|order|tambah)\\s*(\\d+)/i);
        if (qtyWords) {
          qty = parseInt(qtyWords[1], 10);
        } else {
          const allNums = [...text.matchAll(/\\d+/g)].map(m => m[0]);
          const otherNum = allNums.find(n => n !== variantNum);
          qty = otherNum ? parseInt(otherNum, 10) : 1;
        }
        console.log('VARIANT MATCH:', varian, 'qty:', qty, 'variants:', promoVariants);
      }
    }`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  // Also rename the inner 'orders' variable to avoid conflict
  fs.writeFileSync(path, code);
  console.log('OK — multi-variant order support added');
} else {
  console.log('SKIP — old block not found exactly');
}
