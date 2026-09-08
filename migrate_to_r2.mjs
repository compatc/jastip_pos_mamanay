import fs from "fs";
import AWS from "aws-sdk";

const SUPABASE_URL = "https://tmnykmpdqdavspmirspw.supabase.co";
const SUPABASE_KEY = "sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF";
const R2_ENDPOINT = "3ba62fa119ee4f295a5655776bfdb386.r2.cloudflarestorage.com";
const R2_ACCESS_KEY = "c48ccbe4d8ccd5f902cf9b9746807ecb";
const R2_SECRET_KEY = "7e5edf36506903caa3f7efcf179217d8adba3f8d841fee1c6c6ca211f0122911";
const R2_BUCKET = "mamanay-images";
const R2_PUBLIC_URL = "https://pub-383108e3bad04ba994957fa1155847a8.r2.dev";

const s3 = new AWS.S3({
  endpoint: `https://${R2_ENDPOINT}`,
  accessKeyId: R2_ACCESS_KEY,
  secretAccessKey: R2_SECRET_KEY,
  region: "auto",
  signatureVersion: "v4",
});

async function supaLogin() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify({ email: "nurulazizahy@gmail.com", password: "drdiskman" }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error("Supa login failed");
  return d.access_token;
}

async function listSupaFiles(token, prefix) {
  const all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/products`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    const data = await res.json();
    if (!Array.isArray(data)) break;
    all.push(...data);
    if (data.length < 100) break;
    offset += 100;
  }
  return all.filter(f => f.id);
}

console.log("Testing R2 upload...");
try {
  await s3.putObject({
    Bucket: R2_BUCKET,
    Key: "test-migration.txt",
    Body: Buffer.from("Hello R2!"),
    ContentType: "text/plain",
    CacheControl: "public, max-age=31536000, immutable",
  }).promise();
  console.log("Test upload OK!");

  const data = await s3.getObject({ Bucket: R2_BUCKET, Key: "test-migration.txt" }).promise();
  console.log("Read back:", data.Body.toString());

  await s3.deleteObject({ Bucket: R2_BUCKET, Key: "test-migration.txt" }).promise();
  console.log("Test cleanup OK\n");
} catch (err) {
  console.error("Test FAILED:", err.message);
  process.exit(1);
}

const token = await supaLogin();
console.log("Supa login OK");

const prodFiles = await listSupaFiles(token, "products/");
const varFiles = await listSupaFiles(token, "variants/");
const allFiles = [
  ...prodFiles.map(f => ({ ...f, supaKey: `products/${f.name}` })),
  ...varFiles.map(f => ({ ...f, supaKey: `variants/${f.name}` })),
];

console.log(`Migrating ${allFiles.length} files (${prodFiles.length} products + ${varFiles.length} variants)...`);

let success = 0, failed = 0;
const urlMap = {};
const BATCH = 5;

for (let i = 0; i < allFiles.length; i += BATCH) {
  const batch = allFiles.slice(i, i + BATCH);
  await Promise.all(batch.map(async (file) => {
    const oldUrl = `${SUPABASE_URL}/storage/v1/object/public/products/${file.supaKey}`;
    const newUrl = `${R2_PUBLIC_URL}/${file.supaKey}`;
    try {
      const dlRes = await fetch(oldUrl);
      if (!dlRes.ok) throw new Error(`Download ${dlRes.status}`);
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const ct = file.metadata?.mimetype || "image/jpeg";

      await s3.putObject({
        Bucket: R2_BUCKET,
        Key: file.supaKey,
        Body: buffer,
        ContentType: ct,
        CacheControl: "public, max-age=31536000, immutable",
      }).promise();

      urlMap[oldUrl] = newUrl;
      success++;
    } catch (err) {
      console.error(`  FAILED: ${file.supaKey} - ${err.message}`);
      failed++;
    }
  }));
  console.log(`  Progress: ${Math.min(i + BATCH, allFiles.length)}/${allFiles.length}`);
}

console.log(`\nDone: ${success} success, ${failed} failed`);
fs.writeFileSync("D:/POS NAY/url_map.json", JSON.stringify(urlMap, null, 2));
console.log(`URL map saved (${Object.keys(urlMap).length} entries)`);
