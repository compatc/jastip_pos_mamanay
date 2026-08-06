/**
 * QRIS Static → Dynamic Converter
 * 
 * Tanpa dependency eksternal. Cukup jalankan:
 *   node scripts/qris-convert.mjs <amount> <qris_static>
 * 
 * Contoh:
 *   node scripts/qris-convert.mjs 25000 "00020101021230..."
 */

const EMV_TAGS = {
  0: "00", // Payload Format Indicator
  1: "01", // Point of Initiation Method
  2: "01", // Merchant Account Information
  25: "25", // Merchant Account Information (2)
  26: "26", // Merchant Account Information (3)
  27: "27", // Merchant Account Information (4)
  28: "28", // Merchant Account Information (5)
  29: "29", // Merchant Account Information (6)
  30: "30", // Merchant Account Information (7)
  31: "31", // Merchant Account Information (8)
  32: "32", // Merchant Account Information (9)
  33: "33", // Merchant Account Information (10)
  34: "34", // Merchant Account Information (11)
  35: "35", // Merchant Account Information (12)
  36: "36", // Merchant Account Information (13)
  37: "37", // Merchant Account Information (14)
  38: "38", // Merchant Account Information (15)
  39: "39", // Merchant Account Information (16)
  40: "40", // Merchant Account Information (17)
  41: "41", // Merchant Account Information (18)
  42: "42", // Merchant Account Information (19)
  43: "43", // Merchant Account Information (20)
  44: "44", // Merchant Account Information (21)
  45: "45", // Merchant Account Information (22)
  46: "46", // Merchant Account Information (23)
  47: "47", // Merchant Account Information (24)
  48: "48", // Merchant Account Information (25)
  49: "49", // Merchant Account Information (26)
  50: "50", // Merchant Account Information (27)
  51: "51", // Merchant Account Information (28)
  52: "52", // Merchant Category Code
  53: "53", // Transaction Currency
  54: "54", // Transaction Amount
  55: "55", // Tip or Convenience Indicator
  56: "56", // Value of Convenience Fee Fixed
  57: "57", // Value of Convenience Fee Variable
  58: "58", // Country Code
  59: "59", // Merchant Name
  60: "60", // Merchant City
  61: "61", // Postal Code
  62: "62", // Additional Data Field Template
  63: "63", // CRC
};

function parseEMV(qris) {
  const fields = [];
  let i = 0;
  while (i < qris.length - 4) {
    const id = qris.substring(i, i + 2);
    const len = parseInt(qris.substring(i + 2, i + 4), 10);
    const value = qris.substring(i + 4, i + 4 + len);
    fields.push({ id, len, value });
    i += 4 + len;
  }
  return fields;
}

function buildEMV(fields) {
  let result = "";
  for (const f of fields) {
    const padded = String(f.len).padStart(2, "0");
    result += f.id + padded + f.value;
  }
  return result;
}

function crc16CCITT(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function convert(qrisStatic, amount) {
  const fields = parseEMV(qrisStatic);

  const hasAmount = fields.some((f) => f.id === "54");
  if (hasAmount) {
    console.log("⚠️  QRIS sudah ada field amount (54). Menimpa...");
  }

  const withoutCRC = fields.filter((f) => f.id !== "63");

  const amountStr = String(amount).replace(/\.|,/g, "");
  withoutCRC.push({ id: "54", len: amountStr.length, value: amountStr });

  withoutCRC.sort((a, b) => a.id.localeCompare(b.id));

  let payload = buildEMV(withoutCRC);
  payload += "6304";

  const crc = crc16CCITT(payload);
  payload += crc;

  return payload;
}

import { writeFileSync } from "node:fs";

const amount = parseInt(process.argv[2], 10);
const qrisStatic = process.argv[3];

if (!amount || amount <= 0) {
  console.log("Cara pakai: node scripts/qris-convert.mjs <amount> <qris_static>");
  console.log("Contoh:      node scripts/qris-convert.mjs 25000 \"000201010212...\"");
  process.exit(1);
}

if (!qrisStatic) {
  console.log("❌ QRIS statis belum diisi");
  console.log("Cara pakai: node scripts/qris-convert.mjs <amount> <qris_static>");
  process.exit(1);
}

const dynamic = convert(qrisStatic, amount);
console.log("\n✅ QRIS Dynamic:");
console.log(dynamic);
console.log(`\n💰 Amount: Rp ${amount.toLocaleString("id-ID")}`);
console.log(`📐 Panjang: ${dynamic.length} karakter`);

try {
  const QRCode = await import("qrcode");
  const svg = await QRCode.toString(dynamic, {
    type: "svg",
    margin: 2,
    width: 300,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const outPath = "qris-dynamic-test.svg";
  writeFileSync(outPath, svg);
  console.log(`\n🖼️  QR tersimpan: ${outPath}`);
  console.log("Buka file ini di browser untuk test scan");
} catch (e) {
  console.log("\n⚠️  Gagal generate QR image:", e.message);
  console.log("Install dulu: npm install qrcode");
}
