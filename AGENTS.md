# AGENTS.md

## Rules

- **Loyalty points backfill**: HANYA dari tanggal 20 Agustus 2026 ke atas. Jangan backfill order sebelum 20 Agustus 2026.
- **JANGAN PERNAH clear session WA bot** (`rm -rf /opt/wa-bot/session`). PM2 auto-restart sudah handle. Clear session = user harus scan QR ulang, sangat mengganggu. Kalau Bad MAC, biarkan bot restart sendiri.
- **Customer phone matching**: WAJIB normalize **kedua sisi** (incoming phone DAN DB phone) sebelum compare. Format: strip non-digits, convert `0xxx` → `62xxx`. Kalau cuma normalize satu sisi, customer `08xxx` di DB tidak match incoming `628xxx` → duplicate customer.
- **Phone kosong bug (roma market)**: Customer dengan `phone: ""` di DB bikin `endsWith("")` selalu `true` → semua order bot salah match ke customer itu. **WAJIB skip matching kalau salah satu phone kosong** (`if (!cNorm || !phoneNorm) return false`). Incident: 25 Agustus 2026, 6 order salah assign ke "roma market".
- **VARIANT_STOP**: Kata-kata yang dianggap sebagai stop word saat parsing varian dari reply customer. Kalau ada di list ini, tidak dianggap sebagai nama varian. Update terakhir: 25 Agustus 2026. Full list di `/opt/wa-bot/index.js` line 346.
- **Bot order stock movement**: Bot kirim `product_id: null` ke API. `catalog-order.mjs` sekarang lookup `product_id` by name (fuzzy match) sebelum create stock movement. Sebelumnya stock movement tidak pernah dibuat untuk bot orders karena `product_id` null. Fix: 25 Agustus 2026.
- **Stock movement backfill**: Semua order_items yang punya `product_id` tapi belum ada `stock_movement` sudah di-backfill (86 item + 123 item tanpa product_id sudah di-lookup). Fix: 25 Agustus 2026.
- **Stock display mixed variant bug**: `Inventory.tsx` lama pakai `reduce((a,b) => a + Math.max(0,b), 0)` — clamp per variant, bukan total. Kalau stock movement punya variant null (pembelian) DAN variant name (penjualan), penjualan negative ke-clamp jadi 0 → stok tampil lebih besar. Fix: `Math.max(0, reduce((a,b) => a+b, 0))` — sum dulu baru clamp. 3 produk terdampak: ganci stitch ungu (66→62), produk telon (40→39), produk pink (57→54). Data juga dinormalisasi: movement `variant: null` diubah ke nama variant yang benar. Incident: 25 Agustus 2026.
- **Stock movement variant normalization**: Kalau produk tidak punya `product_variants` tapi punya stock movement dengan variant name (dari bot) DAN variant null (dari pembelian manual), WAJIB normalisasi supaya semua movement pakai key variant yang sama. Kalau tidak, `variantStock` split jadi 2 key terpisah.

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

## Rekap Order — Filter Penjualan Only

### Rule
Rekap order HANYA tampilkan `order_type === 'penjualan'`. Pembelian/pembelian-stok harus di-exclude.

### Bot (`buatRekapProduk()` in index.js)
```javascript
const { data: supaOrders } = await api.from('orders')
  .select('id, customer_id, created_at, order_type')
  .in('id', orderIds)
  .eq('order_type', 'penjualan');  // ← filter di query
```
Items from non-penjualan orders are skipped via `if (!o) continue;`.

### Inventory.tsx (`openRekap()`)
```javascript
const { data: orders } = await supabase
  .from("orders")
  .select("id, created_at, customer_id, order_type")
  .in("id", orderIds)
  .eq("order_type", "penjualan");  // ← filter di query

// Filter items: only include penjualan orders
const penjualanOrderIds = new Set((orders || []).map((o) => o.id));
const merged = items
  .filter((i) => penjualanOrderIds.has(i.order_id))  // ← filter items
  .map((i) => { ... });
```

### Why both filters?
1. Orders query filters by `order_type` → only penjualan orders returned
2. Items filter ensures items from pembelian orders are excluded from display
3. Without item filter, items from pembelian orders would still appear (with undefined customer info)

## Rekap Order — Data Sources (Local + Supabase)

### Rule
Rekap order WA bot mengambil data dari **2 sumber** sekaligus:
1. **Local `orders.json`** — order dari WA bot
2. **Supabase `order_items` + `orders`** — order dari web/app + WA bot (via `pushOrderToSupabase`)

### Flow in `buatRekapProduk()` (index.js)
```
1. Fetch local orders.json → filter by product name + penjualan
2. Fetch Supabase order_items → fuzzy match product name
3. Fetch Supabase orders → filter by penjualan
4. Fetch Supabase customers → get names
5. Merge local + supabase → dedupe by sender+variant+qty+timestamp
6. Group by variant → format rekap
7. Send to WA group
```

### Why both sources?
- WA bot stores orders in local `orders.json` AND pushes to Supabase via `pushOrderToSupabase()`
- Some orders may only exist locally (if Supabase push failed)
- Some orders may only exist in Supabase (if created via web/app)
- Merge + dedupe ensures no duplicates in rekap

### Key code (index.js lines 477-530)
```javascript
// Local
const localList = orders.filter(...);

// Supabase
const { data } = await api.from('order_items')...
const { data: supaOrders } = await api.from('orders')...
// ... fetch customers, build supaItems

// Merge + dedupe
const seen = new Set();
const allItems = [];
for (const x of [...supaItems, ...localList]) {
  const key = (x.sender || '') + '|' + (x.variant || '') + '|' + x.qty + '|' + (x.timestamp || '');
  if (!seen.has(key)) { seen.add(key); allItems.push(x); }
}
```

## Supabase Storage — Product Images

### Setup
- **Bucket**: `products` (public)
- **Policies**: Authenticated upload, public read
- **URL format**: `https://tmnykmpdqdavspmirspw.supabase.co/storage/v1/object/public/products/products/{id}.jpg`

### File structure
```
products/
  {product_id}.jpg     → product images
variants/
  {variant_id}.jpg     → variant images
```

### Rules
- Images stored in Supabase Storage, NOT base64 in DB
- `products.image` and `product_variants.image` store URL, not data
- Upload via authenticated user (anon key + signIn)
- Public read access for catalog/customer pages

### Migration (2026-08-24)
- Migrated 28 product images + 1 variant image from base64 to storage
- All base64 data removed from DB
- Total size: ~5MB compressed (was ~7MB base64 text)

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
