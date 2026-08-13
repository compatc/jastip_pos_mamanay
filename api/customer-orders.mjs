import { getAdmin } from "./pay.mjs";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const customerId = url.searchParams.get("customer_id") || "";

  if (!customerId) {
    json(res, 400, { error: "customer_id required" });
    return;
  }

  try {
    const sb = await getAdmin();
    const { data: orders, error: ordersErr } = await sb
      .from("orders")
      .select("id, created_at, total, paid_total, status, notes")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (ordersErr) {
      json(res, 500, { error: ordersErr.message });
      return;
    }

    const orderIds = (orders || []).map(o => o.id);
    let allItems = [];
    if (orderIds.length > 0) {
      const { data: items } = await sb
        .from("order_items")
        .select("order_id, product_name, quantity, price, discount")
        .in("order_id", orderIds);
      allItems = items || [];
    }

    const itemsByOrder = {};
    for (const item of allItems) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }

    json(res, 200, { orders: orders || [], itemsByOrder });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
