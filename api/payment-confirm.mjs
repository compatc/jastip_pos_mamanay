import { getAdmin } from "./pay.mjs";
import { logAudit } from "./_audit.mjs";
import { createHmac, createHash } from "node:crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(body));
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from('--' + boundary);
  let start = 0;

  while (true) {
    const idx = buffer.indexOf(boundaryBuffer, start);
    if (idx === -1) break;
    if (start > 0) {
      const partData = buffer.slice(start, idx - 2);
      parts.push(partData);
    }
    start = idx + boundaryBuffer.length;
    if (buffer[start] === 0x2d && buffer[start + 1] === 0x2d) break;
    start += 2;
  }
  return parts;
}

function parsePart(partBuf) {
  const headerEnd = partBuf.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;
  const headerStr = partBuf.slice(0, headerEnd).toString('utf8');
  const body = partBuf.slice(headerEnd + 4);

  const nameMatch = headerStr.match(/name="([^"]+)"/);
  const filenameMatch = headerStr.match(/filename="([^"]+)"/);
  const contentTypeMatch = headerStr.match(/Content-Type:\s*(.+)/i);

  const name = nameMatch ? nameMatch[1] : '';
  const filename = filenameMatch ? filenameMatch[1] : null;
  const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : '';

  if (filename) {
    return { name, filename, contentType, isFile: true, data: body };
  }
  return { name, value: body.toString('utf8').trim(), isFile: false };
}

const REDEEM_RATE = 100;

function calcMemberLevel(totalSpent) {
  if (totalSpent >= 10000000) return "platinum";
  if (totalSpent >= 5000000) return "gold";
  return "silver";
}

async function awardLoyaltyPoints(sb, customerId, orderId, amount) {
  try {
    const { data: customer } = await sb
      .from("customers")
      .select("points, total_spent, member_level")
      .eq("id", customerId)
      .single();
    if (!customer) return;

    const base = Math.floor(amount / 1000);
    const multiplier = customer.member_level === "platinum" ? 1.2 : customer.member_level === "gold" ? 1.1 : 1.0;
    const points = Math.floor(base * multiplier);
    if (points <= 0) return;

    const newTotalSpent = (customer.total_spent || 0) + amount;
    const newLevel = calcMemberLevel(newTotalSpent);
    const newPoints = (customer.points || 0) + points;

    await sb.from("customers").update({
      points: newPoints,
      total_spent: newTotalSpent,
      member_level: newLevel,
    }).eq("id", customerId);

    await sb.from("points_history").insert({
      customer_id: customerId,
      order_id: orderId,
      points,
      type: "earn",
      description: `Bayar transfer Rp${amount.toLocaleString("id-ID")}`,
    });
  } catch (e) {
    console.error("[LOYALTY] Failed to award points:", e);
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const action = url.searchParams.get("action");

    // GET /api/payment-confirm — list confirmations (admin)
    if (req.method === "GET" && action === "list") {
      const sb = await getAdmin();
      const { status } = Object.fromEntries(url.searchParams);
      let query = sb.from("payment_confirmations").select("*").order("created_at", { ascending: false });
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      const { data, error } = await query;
      if (error) { json(res, 500, { error: error.message }); return; }
      json(res, 200, { ok: true, data: data || [] });
      return;
    }

    // POST /api/payment-confirm?action=approve|reject — admin approve/reject
    if (req.method === "POST" && action) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const { id } = body;

      if (!id || !action) {
        json(res, 400, { error: "id dan action wajib" });
        return;
      }

      const sb = await getAdmin();
      const newStatus = action === "approve" ? "approved" : "rejected";
      const { error: updateErr } = await sb
        .from("payment_confirmations")
        .update({ status: newStatus })
        .eq("id", id);

      if (updateErr) { json(res, 500, { error: updateErr.message }); return; }

      if (action === "approve") {
        const { data: conf } = await sb
          .from("payment_confirmations")
          .select("order_id, order_ids, amount")
          .eq("id", id)
          .single();

        const allOrderIds = conf?.order_ids
          ? conf.order_ids.split(",").map((s) => s.trim()).filter(Boolean)
          : conf?.order_id
          ? [conf.order_id]
          : [];

        let remaining = conf?.amount || 0;

        for (const oid of allOrderIds) {
          if (remaining <= 0) break;

          const { data: order } = await sb
            .from("orders")
            .select("paid_total, total")
            .eq("id", oid)
            .single();

          if (!order) continue;
          const sisa = (order.total || 0) - (order.paid_total || 0);
          if (sisa <= 0) continue;
          const payAmount = Math.min(remaining, sisa);
          const newPaidTotal = (order.paid_total || 0) + payAmount;
          const newPaymentStatus = newPaidTotal >= (order.total || 0) ? "paid" : "dp";

          const { error: updErr } = await sb
            .from("orders")
            .update({ paid_total: newPaidTotal, payment_status: newPaymentStatus })
            .eq("id", oid);

          if (!updErr) {
            await logAudit(sb, {
              orderId: oid,
              action: "payment_confirmation_approve",
              oldPaidTotal: order.paid_total,
              newPaidTotal,
              oldPaymentStatus: order.payment_status || "unpaid",
              newPaymentStatus,
              performedBy: "payment-confirm.mjs"
            });
          }

          remaining -= payAmount;

          if (newPaymentStatus === "paid") {
            const { data: ord } = await sb.from("orders").select("customer_id, order_type").eq("id", oid).single();
            if (ord && ord.order_type === "penjualan" && ord.customer_id) {
              await awardLoyaltyPoints(sb, ord.customer_id, oid, payAmount);
            }
          }
        }
      }

      json(res, 200, { ok: true });
      return;
    }

    // POST /api/payment-confirm — customer submit transfer (existing)
    if (req.method === "POST") {
      const contentType = req.headers['content-type'] || '';
      let orderId = '', orderIds = '', customerId = '', amount = '', transferDate = '', buktiBase64 = '', buktiMime = '';

      if (contentType.includes('multipart/form-data')) {
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) { json(res, 400, { error: "No boundary" }); return; }
        const boundary = boundaryMatch[1];
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        const raw = buffer.toString('binary');
        const sections = raw.split('--' + boundary).filter(s => s.trim());
        for (const section of sections) {
          if (section.startsWith('--')) continue;
          const [headerPart, ...bodyParts] = section.split('\r\n\r\n');
          const body = bodyParts.join('\r\n\r\n').replace(/\r\n--$/, '');
          const nameMatch = headerPart.match(/name="([^"]+)"/);
          const filenameMatch = headerPart.match(/filename="([^"]+)"/);
          const mimeMatch = headerPart.match(/Content-Type:\s*(.+)/i);
          const name = nameMatch ? nameMatch[1] : '';

          if (filenameMatch) {
            buktiMime = mimeMatch ? mimeMatch[1].trim() : 'image/jpeg';
            const fileBuf = Buffer.from(body, 'binary');
            buktiBase64 = 'data:' + buktiMime + ';base64,' + fileBuf.toString('base64');
          } else {
            const val = body.trim();
            if (name === 'order_id') orderId = val;
            else if (name === 'order_ids') orderIds = val;
            else if (name === 'customer_id') customerId = val;
            else if (name === 'amount') amount = val;
            else if (name === 'transfer_date') transferDate = val;
          }
        }
      } else {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        orderId = body.order_id || '';
        orderIds = body.order_ids || '';
        customerId = body.customer_id || '';
        amount = body.amount || '';
        transferDate = body.transfer_date || '';
        buktiBase64 = body.bukti || '';
        if (buktiBase64) {
          buktiMime = buktiBase64.includes('image/png') ? 'image/png' : 'image/jpeg';
        }
      }

      if (!orderId || !customerId) {
        json(res, 400, { error: "order_id dan customer_id wajib" });
        return;
      }

      if (!buktiBase64) {
        json(res, 400, { error: "Bukti transfer wajib diupload" });
        return;
      }

      const sb = await getAdmin();

      const { data: order } = await sb.from('orders')
        .select('id, total, paid_total, customer_id')
        .eq('id', orderId)
        .single();

      if (!order) { json(res, 404, { error: "Order tidak ditemukan" }); return; }

      const { data: customer } = await sb.from('customers')
        .select('name, phone')
        .eq('id', customerId)
        .single();

      const customerName = customer?.name || '-';
      const sisa = (order.total || 0) - (order.paid_total || 0);

      let buktiUrl = '';
      if (buktiBase64) {
        const ext = buktiMime.includes('png') ? 'png' : 'jpg';
        const r2Key = 'bukti-bayar/' + orderId + '_' + Date.now() + '.' + ext;
        const fileData = Buffer.from(buktiBase64.split(',')[1] || '', 'base64');

        const MAX_SIZE = 4 * 1024 * 1024;
        if (fileData.length > MAX_SIZE) {
          json(res, 413, { error: 'File terlalu besar (' + Math.round(fileData.length / 1024 / 1024) + ' MB). Max 4 MB.' });
          return;
        }

        const R2_ACCOUNT_ID = '3ba62fa119ee4f295a5655776bfdb386';
        const R2_ACCESS_KEY = 'c48ccbe4d8ccd5f902cf9b9746807ecb';
        const R2_SECRET_KEY = '7e5edf36506903caa3f7efcf179217d8adba3f8d841fee1c6c6ca211f0122911';
        const R2_BUCKET = 'mamanay-images';
        const R2_PUBLIC = 'https://pub-383108e3bad04ba994957fa1155847a8.r2.dev';

        const payloadHash = createHash('sha256').update(fileData).digest('hex');
        const now = new Date();
        const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const dateStamp = amzDate.slice(0, 8);

        const canonicalRequest = 'PUT\n/' + R2_BUCKET + '/' + r2Key + '\n\ncontent-type:' + buktiMime + '\nhost:' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com\nx-amz-content-sha256:' + payloadHash + '\nx-amz-date:' + amzDate + '\n\ncontent-type;host;x-amz-content-sha256;x-amz-date\n' + payloadHash;
        const canonicalRequestHash = createHash('sha256').update(canonicalRequest).digest('hex');
        const stringToSign = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + dateStamp + '/auto/s3/aws4_request\n' + canonicalRequestHash;

        const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
        const kDate = hmac('AWS4' + R2_SECRET_KEY, dateStamp);
        const kRegion = hmac(kDate, 'auto');
        const kService = hmac(kRegion, 's3');
        const kSigning = hmac(kService, 'aws4_request');
        const signature = hmac(kSigning, stringToSign).toString('hex');

        const auth = 'AWS4-HMAC-SHA256 Credential=' + R2_ACCESS_KEY + '/' + dateStamp + '/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=' + signature;

        const r2Res = await fetch('https://' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com/' + R2_BUCKET + '/' + r2Key, {
          method: 'PUT',
          headers: {
            Authorization: auth,
            'Content-Type': buktiMime,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
          },
          body: fileData,
        });

        if (!r2Res.ok) {
          const errText = await r2Res.text();
          console.error('R2 bukti-bayar upload failed:', r2Res.status, errText);
          json(res, 500, { error: 'Gagal upload bukti transfer ke storage.' });
          return;
        }

        buktiUrl = R2_PUBLIC + '/' + r2Key;
      }

      let insertOk = false;
      try {
        const { error: insertErr } = await sb.from('payment_confirmations').insert({
          id: orderId + '_' + Date.now(),
          order_id: orderId,
          order_ids: orderIds || orderId,
          customer_id: customerId,
          customer_name: customerName,
          amount: parseFloat(amount) || sisa,
          transfer_date: transferDate,
          bukti_url: buktiUrl,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
        if (insertErr) {
          console.error('Insert confirmation error:', insertErr.message);
        } else {
          insertOk = true;
        }
      } catch (e) {
        console.error('Insert confirmation exception:', e.message);
      }

      const botApiUrl = await getBotApiUrl(sb);
      const adminPhone = '6285894652806';
      let waMsg = '🏦 *Transfer via BCA*\n\n';
      waMsg += '👤 Pelanggan: *' + customerName + '*\n';
      waMsg += '📦 Order: *#' + orderId.slice(0, 6) + '*\n\n';
      waMsg += '💰 Total: Rp ' + (order.total || 0).toLocaleString('id-ID') + '\n';
      waMsg += '💳 Dibayar: *Rp ' + (parseFloat(amount) || sisa).toLocaleString('id-ID') + '*\n';
      waMsg += '📅 Transfer: ' + transferDate + '\n';
      waMsg += '📸 Bukti: ' + (buktiUrl ? 'ada' : 'tidak ada') + '\n\n';
      waMsg += '───────────\n';
      waMsg += 'Link: https://mamanay.vercel.app/orders/' + orderId;

      if (botApiUrl && adminPhone) {
        try {
          await fetch(botApiUrl + '/api/send-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (process.env.BOT_API_TOKEN || 'mamanay2026') },
            body: JSON.stringify({ phone: adminPhone, message: waMsg }),
          });
        } catch (e) {
          console.error('WA send error:', e.message);
        }
      }

      let msg = insertOk ? 'Konfirmasi terkirim' : 'Konfirmasi terkirim (catatan: table payment_confirmations belum ada)';
      json(res, 200, { ok: true, message: msg });
      return;
    }

    json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error('payment-confirm error:', e);
    json(res, 500, { error: e.message });
  }
}

async function getBotApiUrl(sb) {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', 'bot_api_url').maybeSingle();
    if (data?.value) return data.value;
  } catch (e) {}
  return process.env.VITE_BOT_API_URL || 'https://hardship-broadly-mammogram.ngrok-free.dev';
}
