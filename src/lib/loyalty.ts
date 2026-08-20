import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_URL || "";

const REDEEM_RATE = 100;

const LEVEL_THRESHOLDS = {
  silver: 0,
  gold: 2_000_000,
  platinum: 5_000_000,
};

const MULTIPLIER: Record<string, number> = {
  silver: 1.0,
  gold: 1.1,
  platinum: 1.2,
};

export function calculatePoints(amount: number, memberLevel: string): number {
  const base = Math.floor(amount / 1000);
  const multiplier = MULTIPLIER[memberLevel] || 1.0;
  return Math.floor(base * multiplier);
}

export function calculateMemberLevel(totalSpent: number): string {
  if (totalSpent >= LEVEL_THRESHOLDS.platinum) return "platinum";
  if (totalSpent >= LEVEL_THRESHOLDS.gold) return "gold";
  return "silver";
}

export function pointsToDiscount(points: number): number {
  return Math.floor(points / REDEEM_RATE) * 1000;
}

export async function awardPoints(
  customerId: string,
  orderId: string,
  amount: number
) {
  try {
    const res = await fetch(`${API_BASE}/api/award-points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        order_id: orderId,
        amount,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[awardPoints] API error:", data.error);
      return null;
    }
    return data;
  } catch (e) {
    console.error("[awardPoints] fetch error:", e);
    return null;
  }
}

export async function redeemPoints(
  customerId: string,
  orderId: string,
  pointsToUse: number
) {
  try {
    const res = await fetch(`${API_BASE}/api/redeem-points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        order_id: orderId,
        points: pointsToUse,
      }),
    });
    return await res.json();
  } catch (e) {
    console.error("[redeemPoints] error:", e);
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function getCustomerPoints(customerId: string) {
  const { data } = await supabase
    .from("customers")
    .select("points, total_spent, member_level")
    .eq("id", customerId)
    .single();

  return {
    points: data?.points || 0,
    totalSpent: data?.total_spent || 0,
    memberLevel: data?.member_level || "silver",
    discountAvailable: pointsToDiscount(data?.points || 0),
  };
}

export async function getPointsHistory(customerId: string, limit = 20) {
  const { data } = await supabase
    .from("points_history")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}
