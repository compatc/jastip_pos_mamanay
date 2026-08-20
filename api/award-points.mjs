import { getAdmin } from "./pay.mjs";

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
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }

  const { customer_id, order_id, amount } = req.body;
  if (!customer_id || !order_id || !amount || amount <= 0) {
    json(res, 400, { error: "customer_id, order_id, amount required" });
    return;
  }

  try {
    const sb = await getAdmin();

    const { data: customer } = await sb
      .from("customers")
      .select("points, total_spent, member_level")
      .eq("id", customer_id)
      .single();

    if (!customer) { json(res, 404, { error: "Customer not found" }); return; }

    const base = Math.floor(amount / 1000);
    const multiplier = customer.member_level === "platinum" ? 1.2 : customer.member_level === "gold" ? 1.1 : 1.0;
    const points = Math.floor(base * multiplier);
    if (points <= 0) { json(res, 200, { success: true, points: 0 }); return; }

    const newTotalSpent = (customer.total_spent || 0) + amount;
    const newLevel = newTotalSpent >= 10000000 ? "platinum" : newTotalSpent >= 5000000 ? "gold" : "silver";
    const newPoints = (customer.points || 0) + points;

    await sb.from("customers").update({
      points: newPoints,
      total_spent: newTotalSpent,
      member_level: newLevel,
    }).eq("id", customer_id);

    await sb.from("points_history").insert({
      customer_id,
      order_id,
      points,
      type: "earn",
      description: `Bayar Rp${amount.toLocaleString("id-ID")}`,
    });

    json(res, 200, { success: true, points, newPoints, newLevel });
  } catch (e) {
    console.error("[AWARD POINTS ERROR]", e);
    json(res, 500, { error: e.message });
  }
}
