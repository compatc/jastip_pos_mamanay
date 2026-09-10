import { getAdmin } from "./pay.mjs";
import { logAudit } from "./_audit.mjs";
import { createHmac, createHash } from "node:crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

async function handleUploadPacking(body, res) {
  const { fileName, contentType, body: base64Body } = body;
  if (!fileName || !base64Body) { json(res, 400, { error: "fileName and body required" }); return; }

  const MAX_SIZE = 4 * 1024 * 1024;
  const bodyBuf = Buffer.from(base64Body, "base64");
  if (bodyBuf.length > MAX_SIZE) {
    json(res, 413, { error: `File terlalu besar (${Math.round(bodyBuf.length / 1024 / 1024)} MB). Max 4 MB.` });
    return;
  }

  const R2_ACCOUNT_ID = "3ba62fa119ee4f295a5655776bfdb386";
  const R2_ACCESS_KEY = "c48ccbe4d8ccd5f902cf9b9746807ecb";
  const R2_SECRET_KEY = "7e5edf36506903caa3f7efcf179217d8adba3f8d841fee1c6c6ca211f0122911";
  const R2_BUCKET = "mamanay-images";
  const R2_PUBLIC = "https://pub-383108e3bad04ba994957fa1155847a8.r2.dev";

  const r2Key = `packing/${fileName}`;
  const payloadHash = createHash("sha256").update(bodyBuf).digest("hex");

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalRequest = `PUT\n/${R2_BUCKET}/${r2Key}\n\ncontent-type:${contentType || "image/jpeg"}\nhost:${R2_ACCOUNT_ID}.r2.cloudflarestorage.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n\ncontent-type;host;x-amz-content-sha256;x-amz-date\n${payloadHash}`;
  const canonicalRequestHash = createHash("sha256").update(canonicalRequest).digest("hex");
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
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST") { json(res, 405, { error: "POST only" }); return; }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    if (body.action === "upload-packing") {
      await handleUploadPacking(body, res);
      return;
    }

    const sb = await getAdmin();
    const { orderId, action, paid_total, payment_status, fulfillment_status, notes, diskon, ongkir } = body;

    if (action === "delete" && orderId) {
      const { createClient } = await import("@supabase/supabase-js");
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const sbAdmin = serviceKey
        ? createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, serviceKey)
        : sb;
      await sbAdmin.from("order_items").delete().eq("order_id", orderId);
      await sbAdmin.from("orders").delete().eq("id", orderId);
      json(res, 200, { ok: true, deleted: orderId });
      return;
    }

    if (!orderId) { json(res, 400, { error: "orderId wajib" }); return; }

    const { data: oldOrder, error: fetchErr } = await sb
      .from("orders")
      .select("id, paid_total, payment_status, fulfillment_status, total, notes, diskon, ongkir")
      .eq("id", orderId)
      .single();

    if (fetchErr || !oldOrder) { json(res, 404, { error: "Order tidak ditemukan" }); return; }

    const updates = { updated_at: new Date().toISOString() };
    if (paid_total !== undefined) updates.paid_total = paid_total;
    if (payment_status !== undefined) updates.payment_status = payment_status;
    if (fulfillment_status !== undefined) updates.fulfillment_status = fulfillment_status;
    if (notes !== undefined) updates.notes = notes;
    if (diskon !== undefined) updates.diskon = Math.min(diskon, oldOrder.total || 0);
    if (ongkir !== undefined) updates.ongkir = ongkir;

    const { error: updErr } = await sb.from("orders").update(updates).eq("id", orderId);
    if (updErr) { json(res, 500, { error: updErr.message }); return; }

    if (paid_total !== undefined && paid_total !== oldOrder.paid_total) {
      await logAudit(sb, {
        orderId,
        action: "admin_update",
        oldPaidTotal: oldOrder.paid_total,
        newPaidTotal: paid_total,
        oldPaymentStatus: oldOrder.payment_status,
        newPaymentStatus: payment_status || oldOrder.payment_status,
        oldFulfillmentStatus: oldOrder.fulfillment_status,
        newFulfillmentStatus: fulfillment_status || oldOrder.fulfillment_status,
        performedBy: "admin:order-update"
      });
    }

    if (fulfillment_status !== undefined && fulfillment_status !== oldOrder.fulfillment_status) {
      await logAudit(sb, {
        orderId,
        action: "admin_fulfillment_update",
        oldFulfillmentStatus: oldOrder.fulfillment_status,
        newFulfillmentStatus: fulfillment_status,
        performedBy: "admin:order-update"
      });
    }

    json(res, 200, { ok: true });
  } catch (e) {
    console.error("[ORDER-UPDATE]", e);
    json(res, 500, { error: e.message });
  }
}
