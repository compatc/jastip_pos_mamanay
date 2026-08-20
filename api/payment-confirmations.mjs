import { getAdmin } from "./pay.mjs";

const REDEEM_RATE = 50;

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
    const multiplier = customer.member_level === "platinum" ? 1.5 : customer.member_level === "gold" ? 1.2 : 1.0;
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

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const sb = await getAdmin();

    if (req.method === "GET") {
      const { status } = req.query || {};
      let query = sb.from("payment_confirmations").select("*").order("created_at", { ascending: false });
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      const { data, error } = await query;
      if (error) {
        json(res, 500, { error: error.message });
        return;
      }
      json(res, 200, { ok: true, data: data || [] });
      return;
    }

    if (req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const { id, action } = body;

      if (!id || !action) {
        json(res, 400, { error: "id dan action wajib" });
        return;
      }

      const newStatus = action === "approve" ? "approved" : "rejected";
      const { error: updateErr } = await sb
        .from("payment_confirmations")
        .update({ status: newStatus })
        .eq("id", id);

      if (updateErr) {
        json(res, 500, { error: updateErr.message });
        return;
      }

      // If approved, mark order as paid
      if (action === "approve") {
        const { data: conf } = await sb
          .from("payment_confirmations")
          .select("order_id, amount")
          .eq("id", id)
          .single();

        if (conf?.order_id) {
          const { data: order } = await sb
            .from("orders")
            .select("paid_total, total")
            .eq("id", conf.order_id)
            .single();

          const newPaidTotal = (order?.paid_total || 0) + (conf?.amount || 0);
          const clamped = Math.min(newPaidTotal, order?.total || 0);
          const newPaymentStatus = clamped >= (order?.total || 0) ? "paid" : clamped > 0 ? "dp" : "unpaid";

          await sb
            .from("orders")
            .update({ paid_total: clamped, payment_status: newPaymentStatus })
            .eq("id", conf.order_id);

          // Award loyalty points when order becomes fully paid via transfer
          if (newPaymentStatus === "paid" && conf.order_id) {
            const { data: ord } = await sb.from("orders").select("customer_id, order_type").eq("id", conf.order_id).single();
            if (ord && ord.order_type === "penjualan" && ord.customer_id) {
              await awardLoyaltyPoints(sb, ord.customer_id, conf.order_id, conf.amount || 0);
            }
          }
        }
      }

      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("payment-confirmations error:", e);
    json(res, 500, { error: e.message });
  }
}
