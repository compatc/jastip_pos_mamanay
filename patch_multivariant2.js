const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

// The multi-variant block references 'orders' as local but it's the global array
// Fix: change the inner 'orders' to 'multiOrders'
const bad = `        const orders = [];
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
          for (const ov of orders) {`;

const good = `        const multiOrders = [];
        for (const line of lines) {
          const lineLower = line.toLowerCase();
          const match = promoVariants.find(v => lineLower.includes(v.toLowerCase()));
          if (match) {
            const qMatch = line.match(/(\\d+)/);
            const lineQty = qMatch ? parseInt(qMatch[1], 10) : 1;
            multiOrders.push({ variant: match, qty: lineQty });
          }
        }
        if (multiOrders.length > 1) {
          console.log('MULTI-VARIANT ORDER:', multiOrders);
          for (const ov of multiOrders) {`;

if (code.includes(bad)) {
  code = code.replace(bad, good);
  fs.writeFileSync(path, code);
  console.log('OK — fixed variable name');
} else {
  console.log('SKIP — pattern not found');
}
