import { getAdmin } from "./pay.mjs";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const contentType = req.headers['content-type'] || '';
    let orderId = '', orderIds = '', customerId = '', amount = '', transferDate = '', buktiBase64 = '', buktiMime = '';

    if (contentType.includes('multipart/form-data')) {
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) { json(res, 400, { error: "No boundary" }); return; }
      const boundary = boundaryMatch[1];
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      const parts = parsePart(buffer, boundary);

      // Re-parse properly
      const boundaryBuf = Buffer.from('--' + boundary);
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

    // Bukti wajib
    if (!buktiBase64) {
      json(res, 400, { error: "Bukti transfer wajib diupload" });
      return;
    }

    const sb = await getAdmin();

    // Get order info
    const { data: order } = await sb.from('orders')
      .select('id, total, paid_total, customer_id')
      .eq('id', orderId)
      .single();

    if (!order) { json(res, 404, { error: "Order tidak ditemukan" }); return; }

    // Get customer info
    const { data: customer } = await sb.from('customers')
      .select('name, phone')
      .eq('id', customerId)
      .single();

    const customerName = customer?.name || '-';
    const sisa = (order.total || 0) - (order.paid_total || 0);

    // Save bukti to Supabase Storage if provided
    let buktiUrl = '';
    if (buktiBase64) {
      const ext = buktiMime.includes('png') ? 'png' : 'jpg';
      const filePath = 'bukti-bayar/' + orderId + '_' + Date.now() + '.' + ext;
      const fileData = Buffer.from(buktiBase64.split(',')[1] || '', 'base64');
      const { error: uploadErr } = await sb.storage
        .from('public')
        .upload(filePath, fileData, { contentType: buktiMime });
      if (!uploadErr) {
        const { data: urlData } = sb.storage.from('public').getPublicUrl(filePath);
        buktiUrl = urlData?.publicUrl || '';
      }
    }

    // Save confirmation (non-blocking - WA still sends even if table missing)
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
        console.error('Insert confirmation error (table mungkin belum ada):', insertErr.message);
      } else {
        insertOk = true;
      }
    } catch (e) {
      console.error('Insert confirmation exception:', e.message);
    }

    // Send WA to admin
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
        await fetch(botApiUrl + '/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: adminPhone, message: waMsg }),
        });
      } catch (e) {
        console.error('WA send error:', e.message);
      }
    }

    let msg = insertOk ? 'Konfirmasi terkirim' : 'Konfirmasi terkirim (catatan: table payment_confirmations belum ada, data tidak tersimpan)';
    json(res, 200, { ok: true, message: msg });
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
