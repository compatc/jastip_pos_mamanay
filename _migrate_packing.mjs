import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";

const supabase = createClient(
  "https://tmnykmpdqdavspmirspw.supabase.co",
  "sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF"
);

const R2_ACCOUNT_ID = "3ba62fa119ee4f295a5655776bfdb386";
const R2_ACCESS_KEY = "c48ccbe4d8ccd5f902cf9b9746807ecb";
const R2_SECRET_KEY = "7e5edf36506903caa3f7efcf179217d8adba3f8d841fee1c6c6ca211f0122911";
const R2_BUCKET = "mamanay-images";
const R2_PUBLIC = "https://pub-383108e3bad04ba994957fa1155847a8.r2.dev";

function hmacSha256(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function toAmzDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

async function signAndPut(key, body, contentType) {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const canonicalHeaders = `content-type:${contentType}\nhost:${R2_ACCOUNT_ID}.r2.cloudflarestorage.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n/${R2_BUCKET}/${key}\n\n${canonicalHeaders}\n\n${signedHeaders}\n${payloadHash}`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/auto/s3/aws4_request\n${sha256(canonicalRequest)}`;
  const kDate = hmacSha256(`AWS4${R2_SECRET_KEY}`, dateStamp);
  const kRegion = hmacSha256(kDate, "auto");
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${dateStamp}/auto/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body,
  });
  if (!res.ok) throw new Error(`R2 PUT failed ${res.status}: ${await res.text()}`);
}

let uploaded = 0;
let failed = 0;
const urlMap = {};

const { data: files, error: listErr } = await supabase.storage.from("packing-photos").list("", { limit: 1000 });
if (listErr) { console.error("List error:", listErr.message); process.exit(1); }

console.log(`Found ${files.length} packing photos`);

for (const file of files) {
  try {
    const { data: fileData, error: dlErr } = await supabase.storage.from("packing-photos").download(file.name);
    if (dlErr) { console.error(`DL fail ${file.name}:`, dlErr.message); failed++; continue; }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const r2Key = `packing/${file.name}`;
    await signAndPut(r2Key, buffer, "image/jpeg");

    const oldUrl = supabase.storage.from("packing-photos").getPublicUrl(file.name).data.publicUrl;
    const newUrl = `${R2_PUBLIC}/${r2Key}`;
    urlMap[oldUrl] = newUrl;
    uploaded++;
    if (uploaded % 10 === 0) console.log(`  uploaded ${uploaded}/${files.length}...`);
  } catch (e) {
    console.error(`Error ${file.name}:`, e.message);
    failed++;
  }
}

console.log(`\nDone: ${uploaded} uploaded, ${failed} failed`);
fs.writeFileSync("D:\\POS NAY\\packing_url_map.json", JSON.stringify(urlMap, null, 2));
console.log(`URL map saved (${Object.keys(urlMap).length} entries)`);
