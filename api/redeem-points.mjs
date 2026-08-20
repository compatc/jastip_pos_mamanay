import { createClient } from "@supabase/supabase-js";

const REDEEM_RATE = 50;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { customer_id, order_id, points } = req.body;
  if (!customer_id || !order_id || !points || points <= 0) {
    res.status(400).json({ error: "customer_id, order_id, points required" });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: "Supabase not configured" });
    return;
  }
  const sb = createClient(supabaseUrl, supabaseKey);

  const { data: customer } = await sb
    .from("customers")
    .select("id, points, total_spent, member_level")
    .eq("id", customer_id)
    .single();

  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  if ((customer.points || 0) < points) {
    res.status(400).json({ error: "Poin tidak cukup. Poin kamu: " + (customer.points || 0) });
    return;
  }

  const { data: order } = await sb
    .from("orders")
    .select("id, total, paid_total, diskon, payment_status, customer_id")
    .eq("id", order_id)
    .single();

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.customer_id !== customer_id) {
    res.status(403).json({ error: "Order bukan milik customer ini" });
    return;
  }
  if (order.payment_status === "paid") {
    res.status(400).json({ error: "Order sudah lunas" });
    return;
  }

  const discount = Math.floor(points / REDEEM_RATE) * 1000;
  const now = new Date().toISOString();

  const newPoints = (customer.points || 0) - points;
  const existingDiskon = order.diskon || 0;
  const newDiskon = existingDiskon + discount;

  await sb.from("customers").update({ points: newPoints }).eq("id", customer_id);

  await sb.from("orders").update({ diskon: newDiskon, updated_at: now }).eq("id", order_id);

  await sb.from("points_history").insert({
    customer_id,
    order_id,
    points: -points,
    type: "redeem",
    description: `Tukar ${points} poin → diskon Rp${discount.toLocaleString("id-ID")} (Order #${order_id.slice(0, 8)})`,
    created_at: now,
  });

  res.json({
    success: true,
    pointsUsed: points,
    discount,
    newPoints,
    newDiskon,
  });
}
