import { getAdmin } from "./pay.mjs";
import { logAudit } from "./_audit.mjs";

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
    const sb = await getAdmin();
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const { orderId, paid_total, payment_status, fulfillment_status, notes, diskon, ongkir } = body;

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
    if (diskon !== undefined) updates.diskon = diskon;
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
