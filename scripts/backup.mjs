import { writeFileSync, mkdirSync } from "fs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const TABLES = ["customers", "products", "orders", "order_items", "stock_movements"];
const date = new Date().toISOString().slice(0, 10);

mkdirSync("backups", { recursive: true });

const backup = { date, tables: {} };

for (const table of TABLES) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
    },
  });
  const data = await res.json();
  if (Array.isArray(data)) {
    backup.tables[table] = { rows: data.length, data };
    console.log(`${table}: ${data.length} rows`);
  } else {
    backup.tables[table] = { rows: 0, error: data };
    console.error(`${table}: error`, data);
  }
}

const file = `backups/backup-${date}.json`;
writeFileSync(file, JSON.stringify(backup));
console.log(`Saved: ${file}`);
