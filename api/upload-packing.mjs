import { createHmac, randomUUID } from "node:crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST") { json(res, 405, { error: "POST only" }); return; }

  try {
    const { fileName, contentType, body: base64Body } = req.body;
    if (!fileName || !base64Body) { json(res, 400, { error: "fileName and body required" }); return; }

    const R2_ACCOUNT_ID = "3ba62fa119ee4f295a5655776bfdb386";
    const R2_ACCESS_KEY = "c48ccbe4d8ccd5f902cf9b9746807ecb";
    const R2_SECRET_KEY = "7e5edf36506903caa3f7efcf179217d8adba3f8d841fee1c6c6ca211f0122911";
    const R2_BUCKET = "mamanay-images";
    const R2_PUBLIC = "https://pub-383108e3bad04ba994957fa1155847a8.r2.dev";

    const r2Key = `packing/${fileName}`;
    const bodyBuf = Buffer.from(base64Body, "base64");
    const payloadHash = createHmac("sha256", "").update(bodyBuf).digest("hex");

    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);

    const canonicalRequest = `PUT\n/${R2_BUCKET}/${r2Key}\n\ncontent-type:${contentType || "image/jpeg"}\nhost:${R2_ACCOUNT_ID}.r2.cloudflarestorage.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n\ncontent-type;host;x-amz-content-sha256;x-amz-date\n${payloadHash}`;
    const canonicalRequestHash = createHmac("sha256", "").update(canonicalRequest).digest("hex");
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/auto/s3/aws4_request\n${canonicalRequestHash}`;

    const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
    const kDate = hmac(`AWS4${R2_SECRET_KEY}`, dateStamp);
    const kRegion = hmac(kDate, "auto");
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = hmac(kSigning, stringToSign).toString("hex");

    const auth = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${dateStamp}/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

    const r2Res = await fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${r2Key}`, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": contentType || "image/jpeg",
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
      body: bodyBuf,
    });

    if (!r2Res.ok) {
      const errText = await r2Res.text();
      json(res, 500, { error: `R2 upload failed ${r2Res.status}: ${errText}` });
      return;
    }

    json(res, 200, { ok: true, url: `${R2_PUBLIC}/${r2Key}` });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
