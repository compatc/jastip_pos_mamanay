import { createClient } from "@supabase/supabase-js";

const REDEEM_RATE = 50;

function calculateMemberLevel(totalSpent) {
  if (totalSpent >= 5000000) return "platinum";
  if (totalSpent >= 2000000) return "gold";
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: "Supabase not configured" });
    return;
  }

  const sb = createClient(supabaseUrl, supabaseKey);

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

  res.status(405).json({ error: "Method not allowed" });
}
