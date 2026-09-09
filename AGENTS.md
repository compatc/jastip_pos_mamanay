# AGENTS.md

## Rules

- **Loyalty points backfill**: HANYA dari tanggal 20 Agustus 2026 ke atas. Jangan backfill order sebelum 20 Agustus 2026.
- **JANGAN PERNAH clear session WA bot** (`rm -rf /opt/wa-bot/session`). PM2 auto-restart sudah handle. Clear session = user harus scan QR ulang, sangat mengganggu. Kalau Bad MAC, biarkan bot restart sendiri.
- **Customer phone matching**: WAJIB normalize **kedua sisi** (incoming phone DAN DB phone) sebelum compare. Format: strip non-digits, convert `0xxx` → `62xxx`. Kalau cuma normalize satu sisi, customer `08xxx` di DB tidak match incoming `628xxx` → duplicate customer.
- **Phone kosong bug (roma market)**: Customer dengan `phone: ""` di DB bikin `endsWith("")` selalu `true` → semua order bot salah match ke customer itu. **WAJIB skip matching kalau salah satu phone kosong** (`if (!cNorm || !phoneNorm) return false`). Incident: 25 Agustus 2026, 6 order salah assign ke "roma market".
- **VARIANT_STOP**: Kata-kata yang dianggap sebagai stop word saat parsing varian dari reply customer. Kalau ada di list ini, tidak dianggap sebagai nama varian. Update terakhir: 31 Agustus 2026. Full list: kak, ka, kaa, kk, kakak, bang, mbak, mbk, mimin, sis, sist, dong, ya, yah, yh, deh, pls, pcs, buah, set, mau+, beli, ambil, pesan, order, tambah, minat, ingin, pingin, pengen, saya, aku, min, bro, admin, sama, lagi, boleh, bisa, neng, teteh, **juga, jg, jgaaa**. Di `/opt/wa-bot/index.js`.
- **Bot order stock movement**: Bot kirim `product_id: null` ke API. `catalog-order.mjs` sekarang lookup `product_id` by name (fuzzy match) sebelum create stock movement. Sebelumnya stock movement tidak pernah dibuat untuk bot orders karena `product_id` null. Fix: 25 Agustus 2026.
- **Stock movement backfill**: Semua order_items yang punya `product_id` tapi belum ada `stock_movement` sudah di-backfill (86 item + 123 item tanpa product_id sudah di-lookup). Fix: 25 Agustus 2026.
- **Stock display mixed variant bug**: `Inventory.tsx` lama pakai `reduce((a,b) => a + Math.max(0,b), 0)` — clamp per variant, bukan total. Kalau stock movement punya variant null (pembelian) DAN variant name (penjualan), penjualan negative ke-clamp jadi 0 → stok tampil lebih besar. Fix: `Math.max(0, reduce((a,b) => a+b, 0))` — sum dulu baru clamp. 3 produk terdampak: ganci stitch ungu (66→62), produk telon (40→39), produk pink (57→54). Data juga dinormalisasi: movement `variant: null` diubah ke nama variant yang benar. Incident: 25 Agustus 2026.
- **Stock movement variant normalization**: Kalau produk tidak punya `product_variants` tapi punya stock movement dengan variant name (dari bot) DAN variant null (dari pembelian manual), WAJIB normalisasi supaya semua movement pakai key variant yang sama. Kalau tidak, `variantStock` split jadi 2 key terpisah.
- **Tutup PO (`po_closed`)**: Field boolean di tabel `products`. Default `false`. Quando `true`, bot dan catalog menolak order produk ini. Toggle button "Tutup PO" / "PO TUTUP" di Inventory.tsx (hanya untuk produk PO). Catalog tampilkan "PO Ditutup" badge merah dan disable tombol "Tambah ke Keranjang". Bot cek via API sebelum push order. Kolom: `ALTER TABLE products ADD COLUMN po_closed BOOLEAN DEFAULT FALSE;`
- **Known limitation Tutup PO**: Bot simpan order ke `orders.json` DULU, baru push ke API. Kalau API reject (PO ditutup), order tetap ada di `orders.json` tapi ga ada di Supabase. Admin harus pastikan ga ada yang sedang order sebelum tutup PO.
- **Loyalty points discount cap**: Order < Rp500.000 → max diskon Rp10.000. Order ≥ Rp500.000 → max diskon Rp20.000. Logic di `redeem-points.mjs`. Fix: 26 Agustus 2026.
- **Cancelled order payment**: Order dengan `fulfillment_status = cancelled` TIDAK BOLEH di-mark sebagai `paid`. Kalau admin salah mark, harus di-revert ke `unpaid` + `paid_total = 0`. Incident: 26 Agustus 2026.
- **Bot parseQty fix (pcs/buah priority)**: `parseQty()` sekarang cek `\d+\s*(pcs|buah)` DULU sebelum `mau\s*(\d+)`. Sebelumnya "kak mau 38 1 pcs" → qty=38 (salah). Sekarang → qty=1 (prioritas angka + unit). Fix: 26 Agustus 2026.
- **Bot variant qty re-calculation**: Kalau angka yang match `mau\s*(\d+)` SAMA dengan nama variant (`variantNum`), angka itu di-skip dan cari angka lain. Contoh: variannya "38", customer "mau 38" → qty=1 (bukan 38). Kalau "mau 38 2 pcs" → qty=2. Fix: 26 Agustus 2026.
- **Bot parseQty fix (ukuran/size ignore)**: Customer tulis "ukuran 180 (1)" atau "size 180 (1)" — artinya 1 PCS, bukan 180. `parseQty()` sekarang prioritas: (1) `\d+\s*(pcs|buah)` → (2) `mau\s*(\d+)` → (3) `\((\d+)\)` (angka dalam kurung). Angka telanjang tanpa unit diabaikan. Incident: 27 Agustus 2026, Wulandari order sprei size 180, qty salah jadi 180. Fix di `/opt/wa-bot/index.js` parseQty function.
- **Bot variant block qty override fix**: `parseQty` sudah benar, tapi ada bug di variant block (line ~939): `allNums.find(n => n !== variantNum)` — kalau `variantNum` kosong (varian tanpa angka, seperti "bear bakery"), semua angka di text lolos → qty diambil dari angka pertama (yang bisa jadi ukuran). Fix: skip `allNums` logic kalau `variantNum` kosong. Contoh: "bear bakery sz 180 (1)" → varian="bear bakery", variantNum="", allNums=["180","1"] → sekarang keep parseQty result (1) instead of override jadi 180. Incident: 28 Agustus 2026, Wulandari order sprei motif bear bakery, qty salah jadi 180 (total Rp15.9jt). Fix di `/opt/wa-bot/index.js` variant block.

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

### Key code (buatRekapProduk in index.js)
```javascript
// Local — skip pushed orders (already in Supabase)
const localList = orders.filter((o) => {
  return onama === nama && isPenjualan && !o.pushed;  // ← only unpushed
});

// Supabase — 3 queries combined, MUST dedupe
const data = [...exactData, ...fuzzyData, ...baseData];
const dataUniq = data.filter(i => { /* dedupe by order_id+variant */ });

// Loop uses dataUniq, NOT data (data has duplicates from 3 queries!)
for (const item of dataUniq) { supaItems.push(...); }

// Merge by phone+variant (sum qty across orders)
const merged = new Map();
for (const x of [...supaItems, ...localList]) {
  const key = phone_last4 + '|' + variant;
  if (merged.has(key)) existing.qty += x.qty;
  else merged.set(key, { ...x });
}
```

## Product Images — Cloudflare R2

### Setup
- **Bucket**: `mamanay-images` (Cloudflare R2, public)
- **URL format**: `https://pub-383108e3bad04ba994957fa1155847a8.r2.dev/products/{id}.jpg`
- **Cache-Control**: `public, max-age=31536000, immutable` (browser caches 1 year, egress ~zero)

### File structure
```
products/
  {product_id}.jpg     → product images
  {timestamp}-{id}.jpg → product images (uploaded via web app)
variants/
  {variant_id}.jpg     → variant images
packing/
  {orderId}-{timestamp}.jpg → packing photos (uploaded from Shipments page)
```

### Rules
- Images stored in Cloudflare R2, NOT base64 in DB
- `products.image`, `product_variants.image`, `orders.packing_photo` store R2 URL
- R2 egress is FREE (no Supabase egress charges)
- Supabase Storage buckets `products` and `packing-photos` still exist as backup

### Migration history
- 2026-08-24: Migrated 28 product images from base64 to Supabase Storage
- 2026-09-08: Migrated 135 images to Cloudflare R2 (free egress)
- 2026-09-09: R2 confirmed accessible from mobile browsers, reverted from Supabase Storage back to R2
- 2026-09-09: Migrated 69 packing photos from Supabase Storage `packing-photos` to R2 `packing/` folder

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

## Build Rules

- **Loader2 missing import**: `Loader2` dari `lucide-react` WAJIB di-import kalau dipakai di file. Incident: 25 Agustus 2026, Inventory.tsx crash di Vercel karena `Loader2` dipakai di PO Summary Modal tapi tidak di-import. **Selalu cek import sebelum push.**
- **Duplicate type declaration**: Jangan duplicate type declaration di `useStore.ts`. Kalau edit signature, update DI TEMPAT YANG SAMA, jangan buat baru.
- **Duplicate const variable**: JANGAN declare `const` yang sama 2x di scope yang sama. Incident: 25 Agustus 2026, `catalog-order.mjs` punya 2x `const url = new URL(...)` di GET handler → SyntaxError → entire API 500 → catalog kosong. **Kalau tambah fitur baru di function yang sudah ada, PAKAI variable yang SUDAH ADA, jangan buat baru.**
- **Rekap order dedup (local + Supabase)**: `buatRekapProduk()` mengambil data dari 2 sumber: local `orders.json` + Supabase `order_items`. Order yang sama muncul di keduanya (bot push ke Supabase). **Dedup key: `phone_last4 + variant + qty + timestamp.slice(0,16)`**. Phone last 4 digits dari `x.number` (local) atau customer `phone` (Supabase). Ini penting karena nama di local (WhatsApp display name) beda dengan nama di Supabase (customer DB name) — misal "Wulandari Handayani" vs "Wulandari 1817". Tanpa phone-based dedup, rekap double. Timestamp trunc ke menit supaya local vs Supabase (beda detik) tetap ke-dedup. Incident: 25 Agustus 2026, rekap double untuk Ratih + Wulandari + yen.
- **Bot order `pushed` flag**: Setelah `pushOrderToSupabase()` sukses, order di `orders.json` ditandai `pushed: true`. Di `buatRekapProduk()`, local orders dengan `pushed: true` di-skip (ambil dari Supabase aja). Order yang push gagal tetap ada di local sebagai fallback. Ini mencegah double order di rekap. Incident: 25 Agustus 2026.
- **Rekap order dedup fix (dataUniq)**: `buatRekapProduk()` lakukan 3 query Supabase (exact + fuzzy + base name). Semua digabung jadi array `data`. **WAJIB loop pake `dataUniq` (sudah di-dedupe), bukan `data` (masih ada duplikat)**. Kalau loop pake `data`, item yang match di exact DAN fuzzy masuk `supaItems` 2x → merge jadikan qty 2. Dedup key: `order_id + variant`. Incident: 28 Agustus 2026, semua customer rekap total 2 padahal order 1 (Riin, Nia, Sherly, Ratih). Fix: `for (const item of dataUniq)` bukan `for (const item of data)`.
- **Rekap merge priority (Supabase > local)**: Merge local + Supabase sekarang **prioritas Supabase**. Supabase items dimasukkan duluan ke `merged` Map. Local items hanya ditambahkan kalau key (`phone_last4 + variant`) belum ada di Map. Kalau sudah ada → local di-skip + log `[Rekap] Skipped local (already in Supabase)`. Ini mencegah double count saat order sudah di-push ke Supabase tapi local belum ditandai `pushed: true`. Incident: 2 September 2026, rekap Wulandari 4 padahal 2, Nadia 2 padahal 1 — karena 31 order lama belum `pushed: true` → merge menghitung dari kedua sumber. Fix: merge prioritaskan Supabase + mark semua 31 order lama sebagai `pushed: true`.
- **Dynamic OG tags**: `catalog-order.mjs` handle 2 tipe OG: `?og=PRODUCT_ID` (produk individual) dan `?ogTag=TAG_NAME` (tag filter). Share URL produk: `/api/catalog-order?og={id}`. Share URL tag: `/api/catalog-order?ogTag={tag}`. Catalog page (`/catalog?tag=...`) adalah SPA → crawler ga bisa baca React → harus pakai API URL untuk share. Share button di Catalog.tsx muncul saat tag aktif, copy API URL ke clipboard.
- **PO Summary Modal placement**: Modal harus di DALAM `<div>` return utama, bukan di luar `</div>` closing. Kalau di luar, build error.
- **Product Bundles**: Tabel `product_bundles` (bundle_id, product_id, quantity). Stock bundle = `min(stok_item / qty_per_item)`. Saat bundle dipesan via `addOrder()`, stok item individual dikurangi (bukan stok bundle). Form bundle di Inventaris: pilih produk + qty. Fix: 26 Agustus 2026.
- **Bot order product lookup — no .or() filter**: `catalog-order.mjs` sebelumnya pake `.or()` PostgREST filter untuk cari produk by name. Kalau product name ada parentheses (contoh: "food container 850 ml defect (lecet)"), filter syntax breakdown → product lookup gagal → `product_id` tetap null → **ga ada stock movement dibuat**. Fix: ganti 2 query terpisah (exact dulu `eq`, kalau ga ada baru fuzzy `ilike`). Backfill 6 order_items + stock movements. Incident: 30 Agustus 2026, food container 850 ml + magnetic parking game + mainan bubble kuda laut + Moell products.
- **Rekap order "list po" hardcode fix**: `buatRekapProduk()` sebelumnya hardcode `"list po *${nama}*"` di output rekap, padahal produk bisa saja ready stock. Fix: query `stock_type` dari `products` table, lalu tampilkan `"list po"` atau `"list ready"` sesuai `stock_type === 'po'`. Fix: 30 Agustus 2026.
- **Bot rekap canonical variant mapping**: `buatRekapProduk()` di `/opt/wa-bot/index.js` juga harus normalize variant name ke canonical dari `product_variants` table. Query product_variants saat build rekap, buat canonicalMap (lowercase → original). Merge key harus pakai canonical name supaya variant dengan case beda atau shorthand (misal "hijaiyah" vs "Hijaiyah & Arabic") tetap ke-grouping dengan benar.
- **Bot multi-variant size parsing**: Customer reply multi-baris seperti `size 180\nrose blossom\nmint garden` — baris `size 180` sebelumnya dianggap nama varian. Fix: deteksi baris ukuran (`size/ukuran/sz` + angka) → simpan pending size → gabungkan dengan varian berikutnya (`rose blossom size 180`). Fix: 30 Agustus 2026.
- **VARIANT_STOP in multi-variant parser**: Multi-variant parser sekarang filter VARIANT_STOP dari nama varian sebelum create order. Contoh: "juga" / "jg" / "jgaaa" tidak dianggap sebagai nama varian. Fix: 31 Agustus 2026.
- **parseTagged emoji regex fix**: `parseTagged()` pake regex `/≡ƒÅ╖∩╕Å\s*(.+)/u` yang broken — karakter `≡ƒÅ╖∩╕Å` ga match emoji 🏷️ asli di WhatsApp. Semua promo dari app (`🏷️ Name [PO] Price`) gagal parsing → "QUOTED TIDAK COCOK POLA" → order ga masuk. Fix: ganti ke `/\u{1F3F7}\uFE0F?\s*(.+)/u` (proper Unicode escape). Incident: 31 Agustus 2026, talenan stainless share ke grup tapi customer reply ga ada rekap.
- **Bot fuzzy variant match**: Customer tidak selalu tulis nama varian persis seperti di promo (misal: "mau bantal" padahal varian "bantal+bantal"). `fuzzyMatchVariant(inputVariant, promoVariants)` scoring: hitung berapa kata input yang match di tiap variant (substring match). Score tertinggi & unique → auto-match. Tie → tanya konfirmasi. No match → minta spesifik. Fix: 2 September 2026. Contoh: "mau bantal guling" → bantal+guling (score 2), "mau bantal" → tie antara bantal+bantal & bantal+guling → tanya.
- **Variant name normalization**: Rekap merge sekarang normalize variant name: strip spasi di sekitar `+` (`Bantal + Guling` → `bantal+guling`), lowercase. Ini memastikan variant dari berbagai sumber (bot, app, manual) ke-merge dengan benar. Fix: 2 September 2026.
- **Rekap unit from DB**: `buatRekapProduk()` sekarang query `unit` dari `products` table (bukan parse dari promo text). Kalau produk unit-nya "SET", rekap tampilkan "set" bukan "pcs". Fix: 2 September 2026.
- **Bot multi-variant comma/newline**: Bot bisa handle order multi-varian dalam 1 pesan. Split by comma (`,`) atau newline (`\n`). Tiap baris di-parse variant + qty terpisah. Fuzzy match tiap varian. Buat order terpisah per varian. Rekap dikirim setelah semua order selesai. Fix: 2 September 2026.
- **Fuzzy match "dan"/"and" normalization**: `fuzzyMatchVariant()` normalize "dan" dan "and" → "&" sebelum compare. Contoh: "hijaiyah dan angka" → match "Hijaiyah & Angka". Ini berlaku untuk semua produk dengan nama mengandung "&" atau "dan". Incident: 2 September 2026, Riin order "hijaiyah 1, huruf dan angka 1, tokoh dan profesi 1" — "dan" tidak match "&" → varian terpisah. Fix: normalisasi di `fuzzyMatchVariant()`.
- **Variant stop "yang"/"yg"**: Tambah "yang" dan "yg" ke VARIANT_STOP. Customer sering tulis "mau yang hijaiyah" — "yang" bukan nama varian. Fix: 2 September 2026.
- **Rekap order canonical variant mapping**: `extractVariant()` di `Inventory.tsx` punya `canonicalMap` dari `product_variants` table (lowercase → original name). Setiap variant name dari order_item di-normalize ke canonical name sebelum grouping. Contoh: `"hijaiyah"` → `"Hijaiyah & Arabic"`, `"huruf & angka"` → `"Huruf & Angka"`. Ini berlaku untuk SEMUA produk, bukan hanya Poster Belajar Interaktif. Kalau ada produk lain dengan case mismatch atau shorthand variant, otomatis ke-normalize. Incident: 3 September 2026, rekap Poster Belajar Interaktif tampilkan 4 varian padahal harusnya 3 (hijaiyah & hijaiyah & arabic terpisah).
- **Shopee sync**: Tabel `shopee_tokens` (access_token, refresh_token, expires_at, shop_id). Kolom `products`: `shopee_item_id`, `shopee_synced_at`. Kolom `product_variants`: `shopee_model_id`. Markup 26% dari `cost_price`. Token refresh otomatis. File: `api/shopee.mjs`, SQL migration: `supabase/migrations/20260903_shopee_sync.sql`.
- **Shopee env vars**: `SHOPEE_PARTNER_ID`, `SHOPEE_SECRET_KEY`, `SHOPEE_SHOP_ID` di `.env` (Vercel). Isi setelah Go Live approved.
- **Shopee price formula**: `Math.ceil(cost_price * 1.26 / 500) * 500` — dibulatkan ke 500 terdekat. Contoh: cost 15.000 → shopee 20.000, cost 25.000 → shopee 32.000.
