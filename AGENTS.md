# AGENTS.md

## Rules

- **Loyalty points backfill**: HANYA dari tanggal 20 Agustus 2026 ke atas. Jangan backfill order sebelum 20 Agustus 2026.
- **JANGAN PERNAH clear session WA bot** (`rm -rf /opt/wa-bot/session`). PM2 auto-restart sudah handle. Clear session = user harus scan QR ulang, sangat mengganggu. Kalau Bad MAC, biarkan bot restart sendiri.

## Bot Multi-Variant Order Flow

### How it works
Bot bisa handle order multi-varian dalam 1 pesan. Customer reply promo dengan beberapa varian sekaligus.

### Supported formats
```
pink 1
rose gold 1
```
```
pink 1, rose gold 1
```
```
2 pink, 3 rose gold
```
```
pink 1; rose gold 2; ungu 1
```

### Processing flow
1. Customer reply promo dengan multi-varian
2. Bot detect `allMatches.length > 1` OR text contains `,` or `\n`
3. Split text by `\n`, `,`, or `;`
4. For each line: match variant name + extract qty
5. Create separate order per variant
6. Send 1x rekap to group (grouped by variant)

### Key functions in index.js
- `parseVariantsFromPromo(promoText)` — extracts variant list from promo message
- `parseVariant(text)` — extracts single variant from reply
- `parseQty(text)` — extracts quantity
- Multi-variant block: lines 826-873

### Important notes
- `promoVariants` MUST be non-empty for multi-variant to work
- If promo has only 1 variant, auto-assign (no need to specify variant name)
- Stock check: PO products always accepted, ready stock deducted per variant
- Each variant creates separate order in Supabase via `pushOrderToSupabase()`
- Rekap sent to group after all orders created

## Rekap Order Fuzzy Match

### Problem
Product name di Supabase bisa beda-beda:
- `Lilo pero lunch box set`
- `Lilo pero lunch box set [PO]`
- `Lilo pero lunch box set ready`
- `Lilo pero lunch box set readyh` (typo)

### Solution
`buatRekapProduk()` pakai fuzzy match:
```javascript
const cleanName = nama.replace(/\[.*?\]|\b(ready|readyh|po)\b/gi, '').replace(/\s+/g, ' ').trim();
// → strips [PO], [Ready], ready, readyh, po
const { data } = await api.from('order_items')
  .or(`product_name.eq.${nama},product_name.ilike.%${cleanName}%`);
```

### How it works
1. Strip modifiers: `[...]`, `ready`, `readyh`, `po` (case-insensitive)
2. Search exact match OR ilike with cleaned name
3. All variations of same product are included in rekap

### Example
```
nama = "Lilo pero lunch box set [PO]"
  ↓ strip [.*?], ready, readyh, po
cleanName = "Lilo pero lunch box set"
  ↓ ilike search
match: "Lilo pero lunch box set", "Lilo pero lunch box set [PO]", "Lilo pero lunch box set ready"
```

### Example scenario
Promo: `🏷️ PERO QIBY TUMBLER 739 ML 94000`
Variants: `pink`, `rose gold`

Customer sends: `pink 1\nrose gold 1`

Bot creates:
- Order 1: PERO QIBY TUMBLER 739 ML, variant: pink, qty: 1, Rp94.000
- Order 2: PERO QIBY TUMBLER 739 ML, variant: rose gold, qty: 1, Rp94.000

Rekap sent to group:
```
📋 *REKAP ORDER*
PERO QIBY TUMBLER 739 ML
list po *PERO QIBY TUMBLER 739 ML* harga Rp94.000/ 1 pcs

*PINK*
1. Devi 5506 -- 5506 -- 1
subtotal: 1

*ROSE GOLD*
1. Devi 5506 -- 5506 -- 1
subtotal: 1

total: 2 pcs
```
