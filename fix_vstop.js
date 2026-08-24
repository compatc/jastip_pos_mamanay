const fs = require('fs');
const f = '/opt/wa-bot/index.js';
let c = fs.readFileSync(f, 'utf8');

const old = "const VARIANT_STOP = /^(kak|ka|kaa|kk|kakak|bang|mbak|mbk|mimin|sis|sist|dong|ya|yah|yh|deh|pls|pcs|buah|set|mau+|beli|ambil|pesan|order|tambah|minat|ingin|pingin|pengen|saya|aku|min|bro|admin|sama|lagi|boleh|bisa|neng|teteh)$/i;";
const rep = "const VARIANT_STOP = /^(kak|ka|kaa|kk|kakak|bang|mbak|mbk|mimin|sis|sist|dong|ya|yah|yh|deh|pls|pcs|buah|set|mau+|beli|ambil|pesan|order|tambah|minat|ingin|pingin|pengen|saya|aku|min|bro|admin|sama|lagi|boleh|bisa|neng|teteh|bu|ibu|ini|itu)$/i;";

if (c.includes(old)) {
  c = c.replace(old, rep);
  fs.writeFileSync(f, c, 'utf8');
  console.log('Updated VARIANT_STOP');
} else {
  console.log('Pattern not found');
}
