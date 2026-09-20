import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = "https://tmnykmpdqdavspmirspw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const url = new URL(req.url);

    const warmup = url.searchParams.get("warm");
    if (warmup === "1") {
      return jsonRes({ ok: true });
    }

    const descId = url.searchParams.get("desc");
    if (descId) {
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data: prod } = await sb.from("products").select("description").eq("id", descId).single();
      return jsonRes({ ok: true, description: prod?.description || "" });
    }

    const tagFilter = url.searchParams.get("tag");

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    let query = sb
      .from("products")
      .select("id, name, sell_price, stock, stock_type, po_closed, unit, image")
      .order("name", { ascending: true });

    if (tagFilter) {
      const { data: tagRow } = await sb.from("tags").select("id").ilike("name", tagFilter).maybeSingle();
      if (tagRow) {
        const { data: tagged } = await sb.from("product_tags").select("product_id").eq("tag_id", tagRow.id);
        const tagProductIds = (tagged || []).map((t) => t.product_id);
        if (tagProductIds.length === 0) {
          return jsonRes({ ok: true, data: [], tag: tagFilter });
        }
        query = query.in("id", tagProductIds);
      } else {
        return jsonRes({ ok: true, data: [], tag: tagFilter });
      }
    }

    const { data, error } = await query;
    if (error) {
      return jsonRes({ error: error.message }, 500);
    }

    const productIds = (data || []).map((p) => p.id);
    const movSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: allTags }, { data: allProductTags }, { data: variants }, { data: movements }] = await Promise.all([
      sb.from("tags").select("id, name"),
      sb.from("product_tags").select("product_id, tag_id").in("product_id", productIds),
      sb.from("product_variants").select("id, product_id, name, image, stock, stock_type").in("product_id", productIds),
      sb.from("stock_movements").select("product_id, variant, qty").in("product_id", productIds).gte("created_at", movSince),
    ]);

    const tagMap = {};
    for (const t of allTags || []) tagMap[t.id] = t.name;
    const productTagMap = {};
    for (const pt of allProductTags || []) {
      if (!productTagMap[pt.product_id]) productTagMap[pt.product_id] = [];
      const tagName = tagMap[pt.tag_id];
      if (tagName) productTagMap[pt.product_id].push(tagName);
    }

    const variantStockMap = {};
    const variantDetailsMap = {};
    for (const v of variants || []) {
      if (!variantStockMap[v.product_id]) variantStockMap[v.product_id] = {};
      variantStockMap[v.product_id][v.name] = v.stock || 0;
      if (!variantDetailsMap[v.product_id]) variantDetailsMap[v.product_id] = [];
      variantDetailsMap[v.product_id].push({ id: v.id, name: v.name, image: v.image || "", stock: v.stock || 0, stock_type: v.stock_type || null });
    }
    for (const m of movements || []) {
      const pid = m.product_id;
      const v = m.variant || "(tanpa varian)";
      if (!variantStockMap[pid]) variantStockMap[pid] = {};
      variantStockMap[pid][v] = (variantStockMap[pid][v] || 0) + m.qty;
      const details = variantDetailsMap[pid];
      if (details) {
        const vd = details.find((d) => d.name === v);
        if (vd) vd.stock = (vd.stock || 0) + m.qty;
      }
    }

    const result = (data || []).map((p) => {
      const vs = variantStockMap[p.id];
      const hasVariants = vs && Object.keys(vs).length > 0;
      const realStock = hasVariants
        ? Object.values(vs).reduce((a, b) => a + Math.max(0, b), 0)
        : p.stock;
      return { ...p, stock: realStock, variants: variantDetailsMap[p.id] || [], tags: productTagMap[p.id] || [] };
    });

    return jsonRes({ ok: true, data: result, tag: tagFilter || null }, 200, {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonRes(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extra,
    },
  });
}
