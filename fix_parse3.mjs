import { readFileSync, writeFileSync } from 'fs';
const file = '/opt/wa-bot/index.js';
let code = readFileSync(file, 'utf8');

const oldTagged = `      } else if (tagged) {
        currentPromo = { ...tagged, sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };
        console.log('PROMO DETECTED (tagged):', JSON.stringify(tagged));`;

const newTagged = `      } else if (tagged) {
        currentPromo = { ...tagged, sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };
        if (tagged.stock !== null && tagged.stock !== undefined) {
          promoStocks[tagged.product] = tagged.stock;
          console.log('STOCK SET:', tagged.product, '=', tagged.stock);
        }
        console.log('PROMO DETECTED (tagged):', JSON.stringify(tagged));`;

if (code.includes(oldTagged)) {
  code = code.replace(oldTagged, newTagged);
  writeFileSync(file, code, 'utf8');
  console.log('Fixed tagged stock storage');
} else {
  console.log('Pattern not found');
}
