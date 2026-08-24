import { getAdmin } from "./pay.mjs";

const REDEEM_RATE = 100;

function calculateMemberLevel(totalSpent) {
  if (totalSpent >= 10000000) return "platinum";
  if (totalSpent >= 5000000) return "gold";
  return "silver";
}

function pointsToDiscount(points) {
  return Math.floor(points / REDEEM_RATE) * 1000;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const sb = await getAdmin();

  if (req.method === "GET") {
    const { customer_id } = req.query;
    if (!customer_id) {
      res.status(400).json({ error: "customer_id required" });
      return;
    }

    const { data } = await sb
      .from("customers")
      .select("points, total_spent, member_level")
      .eq("id", customer_id)
      .single();

    res.json({
      points: data?.points || 0,
      totalSpent: data?.total_spent || 0,
      memberLevel: data?.member_level || "silver",
      discountAvailable: pointsToDiscount(data?.points || 0),
    });
    return;
  }

  if (req.method === "POST") {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.BOT_API_TOKEN || "mamanay2026"}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { customer_id, points } = req.body;
    if (!customer_id || points == null) {
      res.status(400).json({ error: "customer_id and points required" });
      return;
    }

    const { error } = await sb.from("customers").update({ points }).eq("id", customer_id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true, customer_id, points });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
