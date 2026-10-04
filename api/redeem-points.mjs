import { getAdmin } from "./pay.mjs";

const REDEEM_RATE = 100;

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

  const sb = await getAdmin();

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

  const orderTotal = order.total || 0;
  const tierMax = orderTotal < 50000 ? 5000 : orderTotal < 500000 ? 10000 : 20000;
  const maxDiscount = Math.min(tierMax, orderTotal);
  const maxDiskonLeft = maxDiscount - (order.diskon || 0);
  if (maxDiskonLeft <= 0) {
    res.status(400).json({ error: "Diskon poin sudah mencapai batas maksimal" });
    return;
  }

  // Poin selalu kelipatan REDEEM_RATE, diskon selalu kelipatan 1000 —
  // supaya poin yang dipotong persis setara diskon yang diberikan.
  const requestedPoints = Math.floor(points / REDEEM_RATE) * REDEEM_RATE;
  const requestedDiscount = (requestedPoints / REDEEM_RATE) * 1000;
  const capDiscount = Math.floor(maxDiskonLeft / 1000) * 1000;
  if (capDiscount <= 0) {
    res.status(400).json({ error: "Sisa batas diskon poin kurang dari Rp1.000" });
    return;
  }
  const discount = Math.min(requestedDiscount, capDiscount);
  const usedPoints = (discount / 1000) * REDEEM_RATE;

  if (usedPoints <= 0) {
    res.status(400).json({ error: "Minimal " + REDEEM_RATE + " poin untuk dapat diskon" });
    return;
  }

  const now = new Date().toISOString();
  const newPoints = (customer.points || 0) - usedPoints;
  const newDiskon = (order.diskon || 0) + discount;

  // Optimistic lock: hanya menang kalau points belum berubah sejak dibaca,
  // sehingga klik/tab ganda tidak bisa memotong poin dua kali.
  const { data: locked, error: lockErr } = await sb
    .from("customers")
    .update({ points: newPoints })
    .eq("id", customer_id)
    .eq("points", customer.points || 0)
    .select("id");

  if (lockErr) {
    res.status(500).json({ error: lockErr.message });
    return;
  }
  if (!locked || locked.length === 0) {
    res.status(409).json({ error: "Poin berubah saat diproses. Silakan coba lagi." });
    return;
  }

  try {
    const { error: orderErr } = await sb
      .from("orders")
      .update({ diskon: newDiskon, updated_at: now })
      .eq("id", order_id);
    if (orderErr) throw new Error(orderErr.message);

    const { error: histErr } = await sb.from("points_history").insert({
      customer_id,
      order_id,
      points: -usedPoints,
      type: "redeem",
      description: `Tukar ${usedPoints} poin jadi diskon Rp${discount.toLocaleString("id-ID")} (Order #${order_id.slice(0, 8)})`,
      created_at: now,
    });
    if (histErr) throw new Error(histErr.message);
  } catch (e) {
    // Kompensasi: kembalikan poin supaya tidak hilang tanpa dapat diskon.
    await sb
      .from("customers")
      .update({ points: customer.points || 0 })
      .eq("id", customer_id)
      .eq("points", newPoints);
    res.status(500).json({ error: "Gagal menerapkan diskon: " + e.message });
    return;
  }

  res.json({
    success: true,
    pointsUsed: usedPoints,
    discount,
    newPoints,
    newDiskon,
  });
}
