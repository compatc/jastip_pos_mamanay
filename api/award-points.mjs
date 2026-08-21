import { getAdmin } from "./pay.mjs";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(body));
}

async function handleAward(sb, customer_id, order_id, amount) {
  const { data: customer } = await sb
    .from("customers")
    .select("points, total_spent, member_level")
    .eq("id", customer_id)
    .single();

  if (!customer) return { error: "Customer not found" };

  const base = Math.floor(amount / 1000);
  const multiplier = customer.member_level === "platinum" ? 1.2 : customer.member_level === "gold" ? 1.1 : 1.0;
  const points = Math.floor(base * multiplier);
  if (points <= 0) return { points: 0 };

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

  return { points, newPoints, newLevel };
}

function calcLevel(totalSpent) {
  if (totalSpent >= 10000000) return "platinum";
  if (totalSpent >= 5000000) return "gold";
  return "silver";
}

async function handleUndoBackfill(sb) {
  const { data: backfillEntries, error: histErr } = await sb
    .from("points_history")
    .select("id, customer_id, points, order_id")
    .like("description", "Backfill:%");

  if (histErr) return { error: "Failed to fetch backfill history: " + histErr.message };
  if (!backfillEntries || backfillEntries.length === 0) return { processed: 0, message: "Tidak ada backfill entries ditemukan" };

  const customerIds = [...new Set(backfillEntries.map(h => h.customer_id))];

  const customerTotals = new Map();
  for (const entry of backfillEntries) {
    const cur = customerTotals.get(entry.customer_id) || { points: 0, count: 0 };
    cur.points += entry.points;
    cur.count += 1;
    customerTotals.set(entry.customer_id, cur);
  }

  let fixed = 0;
  for (const cid of customerIds) {
    const { data: customer } = await sb
      .from("customers")
      .select("points, total_spent")
      .eq("id", cid)
      .single();

    if (!customer) continue;

    const subtract = customerTotals.get(cid);
    const newPoints = Math.max(0, (customer.points || 0) - subtract.points);

    await sb.from("customers").update({
      points: newPoints,
    }).eq("id", cid);

    fixed++;
  }

  const { error: delErr } = await sb
    .from("points_history")
    .delete()
    .like("description", "Backfill:%");

  if (delErr) return { error: "Failed to delete backfill entries: " + delErr.message };

  return { undone: backfillEntries.length, customersFixed: fixed };
}

async function handleBackfill(sb, fromDate) {
  const { data: orders, error: ordersErr } = await sb
    .from("orders")
    .select("id, customer_id, total, paid_total, order_type, payment_status, created_at")
    .eq("order_type", "penjualan");

  if (ordersErr) return { error: "Failed to fetch orders: " + ordersErr.message };

  const { data: existingHistory } = await sb
    .from("points_history")
    .select("order_id");

  const existingOrderIds = new Set((existingHistory || []).map(h => h.order_id));

  const filteredOrders = fromDate
    ? (orders || []).filter(o => o.created_at >= fromDate)
    : (orders || []);

  const needsPoints = filteredOrders.filter(o => {
    if (!o.customer_id) return false;
    if (existingOrderIds.has(o.id)) return false;
    const paid = o.paid_total || 0;
    if (paid <= 0) return false;
    const isPaid = o.payment_status === "paid" || paid >= (o.total || 0);
    return isPaid;
  });

  if (needsPoints.length === 0) {
    return { processed: 0, awarded: 0, message: "Semua order sudah ada points_history" };
  }

  let totalPoints = 0;
  let failed = 0;
  const errors = [];
  const results = [];

  for (const order of needsPoints) {
    try {
      const amount = order.total || order.paid_total || 0;
      if (amount <= 0) continue;

      const { data: customer } = await sb
        .from("customers")
        .select("points, total_spent, member_level")
        .eq("id", order.customer_id)
        .single();

      if (!customer) { failed++; errors.push(`${order.id}: customer not found`); continue; }

      const base = Math.floor(amount / 1000);
      const multiplier = customer.member_level === "platinum" ? 1.2 : customer.member_level === "gold" ? 1.1 : 1.0;
      const points = Math.floor(base * multiplier);
      if (points <= 0) continue;

      const newTotalSpent = (customer.total_spent || 0) + amount;
      const newLevel = calcLevel(newTotalSpent);
      const newPoints = (customer.points || 0) + points;

      const { error: updateErr } = await sb.from("customers").update({
        points: newPoints,
        total_spent: newTotalSpent,
        member_level: newLevel,
      }).eq("id", order.customer_id);

      if (updateErr) { failed++; errors.push(`${order.id}: update failed: ${updateErr.message}`); continue; }

      const { error: histErr } = await sb.from("points_history").insert({
        customer_id: order.customer_id,
        order_id: order.id,
        points,
        type: "earn",
        description: `Backfill: bayar Rp${amount.toLocaleString("id-ID")}`,
      });

      if (histErr) { failed++; errors.push(`${order.id}: history failed: ${histErr.message}`); continue; }

      totalPoints += points;
      results.push({ order_id: order.id, customer_id: order.customer_id, amount, points, new_points: newPoints, new_level: newLevel });
    } catch (e) {
      failed++;
      errors.push(`${order.id}: ${e.message}`);
    }
  }

  return { processed: needsPoints.length, awarded: totalPoints, failed, results, errors: errors.length > 0 ? errors : undefined };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }

  try {
    const sb = await getAdmin();
    const parsed = new URL(req.url, "http://localhost");
    const action = req.query?.action || parsed.searchParams.get("action");
    const fromDate = req.query?.from || parsed.searchParams.get("from");

    const auth = req.headers.authorization;
    const isAuth = auth === `Bearer ${process.env.BOT_API_TOKEN || "mamanay2026"}`;

    if (action === "backfill") {
      if (!isAuth) { json(res, 401, { error: "Unauthorized" }); return; }
      const result = await handleBackfill(sb, fromDate);
      json(res, 200, { ok: true, ...result });
      return;
    }

    if (action === "undo-backfill") {
      const result = await handleUndoBackfill(sb);
      json(res, 200, { ok: true, ...result });
      return;
    }

    const { customer_id, order_id, amount } = req.body;
    if (!customer_id || !order_id || !amount || amount <= 0) {
      json(res, 400, { error: "customer_id, order_id, amount required" });
      return;
    }

    const result = await handleAward(sb, customer_id, order_id, amount);
    if (result.error) { json(res, 404, { error: result.error }); return; }
    json(res, 200, { success: true, ...result });
  } catch (e) {
    console.error("[AWARD POINTS ERROR]", e);
    json(res, 500, { error: e.message });
  }
}
