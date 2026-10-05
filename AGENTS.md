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
- **Loyalty points discount cap**: Order < Rp50.000 → max diskon Rp5.000. Order < Rp500.000 → max diskon Rp10.000. Order ≥ Rp500.000 → max diskon Rp20.000. Logic di `redeem-points.mjs` (preview sinkron di `Invoice.tsx` redeemTierMax + `customer.html` previewRedeem). Fix: 26 Agustus 2026, update tier <50rb: 1 Oktober 2026.
- **Rumus bayar (due) WAJIB ikut diskon + kode unik**: `due = total − diskon − kode_unik`, `sisa = due − paid`. **JANGAN pakai `total − paid`** — bug lama bikin order berdiskon dianggap masih utang dan `paid_total` bisa melebihi due. Berlaku di `payment-confirm.mjs` (approve) dan `useStore.ts markOrdersPaid`. Guard "sudah lunas" juga merapikan `payment_status` yang masih `dp` (tanpa mengubah `paid_total`, tanpa memberi poin, skip `cancelled`). Artefak data lama: 6 order sudah lunas menurut rumus tapi masih `dp`. Fix: 5 Oktober 2026.
- **`orders.diskon` vs `orders.diskon_manual` (dua makna dipisah 5 Okt 2026)**: Kolom `orders.diskon` **KHNUSUS diskon tukar poin** (ikut dikurangi di rumus due & mengurangi kuota redeem `tier − diskon`). Kolom `orders.diskon_manual` = diskon manual admin yang **SUDAH dibakar ke `orders.total` saat order dibuat/diedit** (`useStore.ts orderTotal = subtotal − diskon + ongkir`) sehingga **TIDAK boleh dikurangi lagi** di rumus due — kalau masih pakai `diskon`, tagihan jadi kepotong dua kali dan kuota poin ikut termakan. Menulis diskon admin: **hanya `diskon_manual`**, jangan pernah `update({ diskon })`. Tampilan invoice/detail tampilkan 2 baris (`Diskon` = manual, `Diskon Poin` = `diskon`). Backfill 5 Okt 2026: `M = subtotal+ongkir−total` → pindah ke `diskon_manual`, sisanya poin; 114 baris diubah, **63 baris M==0 tidak disentuh** (murni poin), **4 baris dilewatkan** (`2b2028d3`, `713138f4` risiko status bayar; `d9cc8591`, `84555b78` tanpa `order_items`). `pay.mjs` invoice pakai **fallback 4 kandidat kolom** supaya invoice tetap terbuka kalau migration belum jalan. SQL: `supabase/migration-20261005-split-diskon.sql` (di-force-add karena `.gitignore` memuat `*.sql`).
- **Redeem poin selalu kelipatan + kunci anti klik ganda**: `usedPoints` kelipatan 100 dan `discount` kelipatan 1000 (`usedPoints = discount/1000 × REDEEM_RATE`), `maxDiskon` dibulatkan ke bawah kelipatan 1000 — preview di `Invoice.tsx` dan `customer.html` WAJIB pakai pembulatan yang sama. `redeem-points.mjs` pakai optimistic lock `.eq("points", <nilai saat dibaca>)` → balas **409** kalau baris berubah (klik/tab ganda), plus kompensasi rollback poin kalau insert `orders`/`points_history` gagal. Fix: 5 Oktober 2026.
- **awardedPoints di invoice hanya `type = 'earn'`**: `pay.mjs` query `points_history` harus `.eq("type","earn")` — tanpa filter, baris `redeem` (negatif) ikut terjumlah dan poin di invoice jadi salah/negatif. Incident: order `72717723` earn 121 + redeem −199 → tampil **−78** (kini 121). Fix: 5 Oktober 2026.
- **Cancelled order payment**: Order dengan `fulfillment_status = cancelled` TIDAK BOLEH di-mark sebagai `paid`. Kalau admin salah mark, harus di-revert ke `unpaid` + `paid_total = 0`. Incident: 26 Agustus 2026.
- **Bot parseQty fix (pcs/buah priority)**: `parseQty()` sekarang cek `\d+\s*(pcs|buah)` DULU sebelum `mau\s*(\d+)`. Sebelumnya "kak mau 38 1 pcs" → qty=38 (salah). Sekarang → qty=1 (prioritas angka + unit). Fix: 26 Agustus 2026.
- **Bot variant qty re-calculation**: Kalau angka yang match `mau\s*(\d+)` SAMA dengan nama variant (`variantNum`), angka itu di-skip dan cari angka lain. Contoh: variannya "38", customer "mau 38" → qty=1 (bukan 38). Kalau "mau 38 2 pcs" → qty=2. Fix: 26 Agustus 2026.
- **Bot parseQty fix (ukuran/size ignore)**: Customer tulis "ukuran 180 (1)" atau "size 180 (1)" — artinya 1 PCS, bukan 180. `parseQty()` sekarang prioritas: (1) `\d+\s*(pcs|buah)` → (2) `mau\s*(\d+)` → (3) `\((\d+)\)` (angka dalam kurung). Angka telanjang tanpa unit diabaikan. Incident: 27 Agustus 2026, Wulandari order sprei size 180, qty salah jadi 180. Fix di `/opt/wa-bot/index.js` parseQty function.
- **Bot variant block qty override fix**: `parseQty` sudah benar, tapi ada bug di variant block (line ~939): `allNums.find(n => n !== variantNum)` — kalau `variantNum` kosong (varian tanpa angka, seperti "bear bakery"), semua angka di text lolos → qty diambil dari angka pertama (yang bisa jadi ukuran). Fix: skip `allNums` logic kalau `variantNum` kosong. Contoh: "bear bakery sz 180 (1)" → varian="bear bakery", variantNum="", allNums=["180","1"] → sekarang keep parseQty result (1) instead of override jadi 180. Incident: 28 Agustus 2026, Wulandari order sprei motif bear bakery, qty salah jadi 180 (total Rp15.9jt). Fix di `/opt/wa-bot/index.js` variant block.
- **Bot promo image refresh**: `sync_promo.js` dulu cuma isi foto kalau kosong (`imageUrl && !existing[0].image`) → promo ulang ke produk yang sudah ada: harga ke-update tapi foto web tetap foto lama (beda dengan foto promo di grup WA). Fix 1 Oktober 2026: selalu refresh `upd.image` saat `imageUrl` ada dan berbeda; promo tanpa foto (upload gagal) → foto lama dipertahankan. Log bukti: 5× "Updated product" tanpa refresh foto.
- **Bot quoted-promo productId guard**: Customer reply promo lama → bot ambil `productId` dari `currentPromo.productId` (id PROMO TERAKHIR, bukan pesan yang di-quote) padahal `product_name` dari pesan di-quote → nama benar, `product_id` salah → invoice tampilkan foto produk lain. Incident: 1 Oktober 2026, order Wulandari — "Ladybug Letters Matching Toys" dapat id Hughmate Beam Toy, "Face Changing Expression Toys" dapat id puzzle 120 pcs. Fix: guard nama ternormalisasi (`normProd`: strip `[...]`/ready/po, lower, harus equal atau startsWith min 4 char) — kalau nama beda → `productId: null` (API `catalog-order.mjs` lookup by name). Hapus juga fallback `|| currentPromo.productId` di 3 situs `orderData` (`promo.productId || null`). Data reparasi: 2 order_items + 2 stock_movements di-repoint, stok 4 produk disesuaikan. Audit: dari 839 item bersistem, 10 order lain kena bug sama (e3adb18d, ab009b2b, e71641c6, 4b58aaa7 [deleted], 032c8a4b, f488cf87, 48e6e4b5 [deleted], d0d634bb, b8886e04, bf61f653) — **sudah direparasi 1 Oktober 2026**: 10 order_items di-repoint ke produk benar (kecuali "handuk isi 2" → null, produk tak ada di katalog), 6 stock_movements di-repoint + 1 movement salah ("handuk isi 2" credit ke selimut anak) dihapus, stok 11 produk disesuaikan. Audit ulang: 0 item salah produk. Pelajaran operasional: PATCH Supabase WAJIB pakai UUID lengkap + `Prefer: return=representation` (filter `id=eq.<prefix>*` match 0 baris tapi tetap 200 OK — gampang dikira sukses).

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

### r2.dev DIBLOKIR ISP Indonesia (sejak ~Juni 2026)
- Domain `r2.dev` di-hijack DNS oleh ISP Indonesia (arah ke `internetpositif.id`/`aduankonten.id`) → semua `<img>` dari R2 gagal load di browser pelanggan. File R2 sendiri SEHAT (akses paksa IP Cloudflare asli = 200). Berita: "Pemblokiran r2.dev" ~30 Juni 2026, Komdigi belum beri penjelasan.
- **Fix 4 Okt 2026 — proxy Vercel**:
  1. `vercel.json` rewrite **pertama**: `/img/:path*` → `https://pub-383108e3bad04ba994957fa1155847a8.r2.dev/:path*` (external proxy, bukan serverless function — jangan tambah `api/img.mjs`, limit 12 function sudah penuh). SPA catch-all juga di-exclude `img/`.
  2. Client render: helper `src/lib/img.ts` `imgUrl()` — pakai **hanya saat render** (`src={imgUrl(u)}`) di Catalog.tsx (kartu, carousel, varian, keranjang) + Invoice.tsx (item & foto packing). **JANGAN transform data di store/form** — form edit product harus tetap simpan URL R2 asli ke DB.
  3. Safety net: global capture listener `error` di `src/main.tsx` — img `r2.dev` gagal → retry `/img/...` (sekali), gagal lagi → placeholder SVG pink 🛍️. Ini otomatis menangani SEMUA halaman admin (Inventory/Orders/Shipments/CustomerOrders) tanpa edit per-file. `Invoice.tsx` onError-hide lama DIHAPUS (jangan dikembalikan — bikin gambar hilang tanpa gantinya).
  4. OG meta (`catalog-order.mjs`): absolut `https://mamanay.vercel.app/img/...` via `ogImg()` (crawler ga jalankan JS). `customer-orders.mjs` (`item.image` + `packing_photo`) juga absolut via `imgProxy()`.
  5. `pay.mjs` invoice TIDAK di-transform (konsumen non-browser: pakai URL absolut, bot sudah aman via proxy `send-group`).
- **Alternatif jangka panjang**: custom domain R2 (`img.domainkamu.com` CNAME) — domain sendiri tidak kena blokir; butuh domain + UPDATE URL di DB.
- Jaringan lokal + Pi sama-sama kena blokir → test gambar dari mesin ini selalu gagal kalau tanpa override; verifikasi pakai proxy `/img/...` (harus 200).

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
- **Shopee sync**: Tabel `shopee_tokens` (access_token, refresh_token, expires_at, shop_id). Kolom `products`: `shopee_item_id`, `shopee_synced_at`. Kolom `product_variants`: `shopee_model_id`. Markup 28% dari `cost_price`. Token refresh otomatis. File: `api/shopee.mjs`, SQL migration: `supabase/migrations/20260903_shopee_sync.sql`.
- **Shopee env vars**: `SHOPEE_PARTNER_ID`, `SHOPEE_SECRET_KEY`, `SHOPEE_SHOP_ID` di `.env` (Vercel). Isi setelah Go Live approved.
- **Shopee price formula**: `Math.ceil(cost_price * 1.28 / 500) * 500` — dibulatkan ke 500 terdekat. Markup 28% dari `cost_price`.
- **Vercel serverless function limit (12 max)**: Vercel Hobby plan max **12 serverless functions**. Kalau lebih deploy gagal: `"No more than 12 Serverless Functions can be added"`. Semua file di `api/` dengan `export default` dihitung sebagai function. File `_audit.mjs` tanpa `export default` TIDAK dihitung. Fix: 10 September 2026, `upload-packing.mjs` digabung ke `order-update.mjs` (action `upload-packing`).
- **send-group proxy: fetch R2 → base64 → bot decode langsung**: `api/send-group.mjs` fetch image dari R2, convert ke base64 data URL, kirim ke bot sebagai `image_url: "data:image/jpeg;base64,..."`. Bot decode base64 langsung tanpa perlu fetch dari R2. Kenapa: R2 ga bisa diakses dari Pi (bot juga gagal fetch). Proxy Vercel BISA fetch dari R2. Incident: 10 September 2026. JANGAN ganti approach ini.
- **Shipments page: direct query, jangan loadAllOrders**: `Shipments.tsx` dulu depend ke `loadAllOrders()` yang fetch SEMUA orders + order_items dalam batch → lambat. Fix: query langsung ke Supabase hanya untuk orders yang dibutuhkan (lunas + shipped). Commit `19c36e5`.
- **Shopee Sync modal redesign**: Tab "Upload Baru" / "Sudah Sync", search box, harga cost → Shopee (+28%) preview, info varian + stok/PO, checkbox select, progress bar saat upload. Commit `804f951`.
- **Shopee add_item required fields**: `category_id` (number), `original_price` (float), `logistic_info` (array of enabled channels), `package_length/width/height` (int cm), `days_to_ship` (int), `attribute_list` (mandatory attrs from `get_attribute_tree`), `image.image_id_list` (not `image_info`). `seller_stock` format: `[{ location_id: "", stock: N }]`. All numeric fields must be `Number()`, not string. First product uploaded: 11 September 2026.
- **Shopee sign format (final)**: `HMAC-SHA256(secret_key, partner_id + /api/v2/path + timestamp [+ access_token + shop_id])`. No separators between fields. `access_token + shop_id` appended for Shop APIs only (not Public APIs like token exchange). Fix: 11 September 2026.
- **Shopee logistics channels**: Call `getChannelList()` first to get enabled channels, then pass only enabled ones in `addItem logistic_info`. Shop must have at least 1 shipping channel enabled in Seller Center before `add_item` works. Fix: 11 September 2026.
- **Shopee attribute_tree API**: Response is `response.list[0].attribute_tree`, NOT `response.attribute_list`. Mandatory field is `mandatory` (not `is_mandatory`). Param name is `category_id_list` (not `category_id`). Fix: 11 September 2026.
- **Shopee category_recommend**: Needs both `item_name` AND image for best results. If no image passed, returns empty. Fallback: set `shopee_category_id` manually in DB. Fix: 11 September 2026.
- **Shopee token refresh sign**: Public API endpoints (`/auth/access_token/get`, `/auth/token/get`) use sign base: `partner_id + /api/v2/path + timestamp` (NO access_token or shop_id appended). Fix: 11 September 2026.
