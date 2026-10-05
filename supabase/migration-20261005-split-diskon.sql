-- 5 Oktober 2026 — Pisahkan diskon manual admin dari diskon tukar poin
--
-- MASALAH:
--   orders.diskon dipakai untuk DUA hal:
--     (a) diskon manual admin  -> orders.total SUDAH dipotong saat order dibuat
--                                 (useStore.ts:559  orderTotal = subtotal - diskon + ongkir)
--     (b) diskon tukar poin    -> orders.total TIDAK diubah (redeem cuma menambah diskon)
--   Rumus due  = total - diskon - kode_unik  benar untuk (b), tapi mengurangi (a) DUA KALI.
--   Kuota poin = tier - order.diskon  juga ikut terpotong oleh diskon manual.
--
-- SOLUSI:
--   * orders.diskon        -> khusus hasil tukar poin (P)
--   * orders.diskon_manual -> diskon manual admin (M); nilainya tetap disimpan untuk
--                             tampilan, TAPI sudah dibakar ke orders.total sehingga
--                             TIDAK ikut dikurangi lagi di rumus due.
--   Rumus due TIDAK berubah: total - diskon - kode_unik
--   Kuota poin TIDAK berubah: tier - diskon
--
-- SETELAH JALANAN INI, backfill 114 baris order lama (98 split + 16 dianggap manual)
-- dijalankan terpisah via API supaya nilai M dan P per order bisa dicatat & dilaporkan.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS diskon_manual numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.diskon IS
  'Diskon dari tukar poin (kelipatan 1000). Ikut dikurangi di rumus due.';
COMMENT ON COLUMN orders.diskon_manual IS
  'Diskon manual admin. SUDAH dipotong dari orders.total, jadi TIDAK dikurangi lagi di rumus due. Hanya untuk tampilan.';
