# API Bot (Supabase REST langsung)

API web untuk bot WhatsApp kamu. Bot login dengan email/password akun yang sama
dengan aplikasi POS, lalu memanggil REST API Supabase langsung. Semua akses data
mengikuti RLS — bot **hanya** bisa melihat/mengubah data milik akun tersebut.

## 1. Setup

Buat `.env` (atau salin dari `pos-app/.env`):

```
SUPABASE_URL=https://tmnykmpdqdavspmirspw.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
BOT_EMAIL=email-akun-kamu@email.com
BOT_PASSWORD=password-akun-kamu
```

Di dalam folder `pos-app` (sudah ada `@supabase/supabase-js`), jalankan:

```bash
npm install @supabase/supabase-js dotenv
node bot/example-wa.js   # tes cepat tanpa WA
```

## 2. Modul helper (paling mudah)

`bot/supabase-bot.js` sudah berisi semua fungsi. Contoh:

```js
import { BotApi, handleBotMessage } from "./bot/supabase-bot.js";

const api = new BotApi();
await api.login("email", "password");

// Cek stok
const produk = await api.searchProducts("skincare");
console.log(api.formatStock(produk));

// Buat order
await api.createOrder({
  contactName: "Budi",
  items: [
    { product_id: "uuid-produk", product_name: "Skincare A", price: 45000, quantity: 1, discount: 0 },
  ],
  paidTotal: 45000,
  ongkir: 5000,
});

// Cek status order terbaru pelanggan
const pelanggan = await api.searchCustomers("Budi");
const order = await api.getOrderWithItems(pelanggan[0].id);
console.log(api.formatOrderStatus(order));
```

## 3. Raw REST (jika bot pakai HTTP langsung)

Login untuk dapat token (JWT):

```bash
curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}'
# Simpan access_token dari response, pakai sebagai Bearer di bawah.
```

| Aksi | Method & URL | Header |
|---|---|---|
| Cek stok produk | `GET $SUPABASE_URL/rest/v1/products?select=name,stock,sell_price,unit&name=ilike.*skincare*` | `Authorization: Bearer <token>` |
| Cari pelanggan | `GET $SUPABASE_URL/rest/v1/customers?select=id,name,phone,category&or=(name.ilike.*budi*,phone.ilike.*budi*)` | sama |
| Tambah pelanggan | `POST $SUPABASE_URL/rest/v1/customers` body JSON | `Authorization`, `Content-Type: application/json`, `Prefer: return=representation` |
| Buat order | `POST $SUPABASE_URL/rest/v1/orders` | sama |
| Tambah item order | `POST $SUPABASE_URL/rest/v1/order_items` | sama |
| Cek order pelanggan | `GET $SUPABASE_URL/rest/v1/orders?customer_id=eq.<uuid>&order=created_at.desc` | sama |

Catatan:
- Semua request wajib header `apikey: $SUPABASE_ANON_KEY` (dan `Authorization: Bearer`).
- Kolom `user_id` diisi otomatis lewat trigger RLS sesuai akun yang login.
- Saat buat order, update stok + `stock_movements` dilakukan seperti di aplikasi —
  disarankan pakai modul `bot/supabase-bot.js` agar logika itu tidak ditulis ulang.

## 4. Perintah teks bot (sudah tersedia di handleBotMessage)

| Perintah | Fungsi |
|---|---|
| `stok <kata>` | Cek stok produk |
| `cari <nama/telepon>` | Cari pelanggan |
| `order <nama/telepon>` | Cek order terbaru pelanggan |
| `tambahpelanggan <nama>\|<telepon>` | Tambah pelanggan baru |
| `bantuan` | Daftar perintah |

Contoh koneksi ke Baileys ada di `bot/example-wa.js`.
