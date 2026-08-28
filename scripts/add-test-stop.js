const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

const old = "ready|po|stok|ok|oke|sip|gas|brp|berapa|harga|total|bun";
const newStop = "ready|po|stok|ok|oke|sip|gas|brp|berapa|harga|total|bun|test";

if (code.includes(old)) {
  code = code.replace(old, newStop);
  fs.writeFileSync('/opt/wa-bot/index.js', code);
  console.log('ADDED test to VARIANT_STOP');
} else {
  console.log('NOT FOUND');
}
