const fs = require("fs");
const path = require("path");

const scriptDir = __dirname;
const rootDir = path.resolve(scriptDir, "..");

const env = fs.readFileSync(path.join(rootDir, ".env"), "utf8");
const urlMatch = env.match(/^VITE_SUPABASE_URL=(.+)$/m);
const SUPABASE_URL = urlMatch ? urlMatch[1].trim() : "";

const keyFile = path.join(scriptDir, "backup.key");
const SERVICE_ROLE_KEY = fs.existsSync(keyFile)
  ? fs.readFileSync(keyFile, "utf8").trim()
  : "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Error: butuh service role key.");
  console.error("1. Buka Supabase > Settings (ikon gear) > API");
  console.error("2. Salin 'service_role' key (yang secret)");
  console.error("3. Simpan ke file: scripts/backup.key (isi satu baris saja)");
  process.exit(1);
}

const TABLES = [
  "customers",
  "orders",
  "order_items",
  "products",
  "stock_movements",
  "product_discounts",
  "accounts",
  "account_transactions",
];

async function fetchAll(table) {
  const rows = [];
  let from = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Range: `${from}-${from + 999}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok) {
      throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    }
    const total = Number(res.headers.get("content-range")?.split("/")[1] || 0);
    const data = await res.json();
    rows.push(...data);
    from += data.length;
    if (data.length === 0 || from >= total) break;
  }
  return rows;
}

(async () => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(rootDir, "backup", ts);
  fs.mkdirSync(dir, { recursive: true });

  const all = {};
  for (const table of TABLES) {
    try {
      const rows = await fetchAll(table);
      all[table] = rows;
      fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
      console.log(`${table.padEnd(24)} ${String(rows.length).padStart(6)} rows`);
    } catch (err) {
      console.error(`GAGAL ${table}: ${err.message}`);
      all[table] = [];
    }
  }

  fs.writeFileSync(path.join(dir, "ALL.json"), JSON.stringify(all, null, 2));
  console.log(`\nSelesai. File tersimpan di: backup/${ts}`);
  console.log("Wajib hapus scripts/backup.key setelah selesai (berisi rahasia).");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
