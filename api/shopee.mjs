import { createHmac, randomUUID } from "node:crypto";
import { getAdmin } from "./pay.mjs";

const BASE_URL = "https://partner.shopeemobile.com/api/v2";
const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID || "";
const SHOPEE_SECRET_KEY = process.env.SHOPEE_SECRET_KEY || "";
const SHOPEE_SHOP_ID = process.env.SHOPEE_SHOP_ID || "";
const SHOPEE_MARKUP = 0.26;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

function generateSign(path, accessToken) {
  const timestamp = Math.floor(Date.now() / 1000);
  const str = `${SHOPEE_PARTNER_ID}${path}${timestamp}`;
  const baseString = str + (accessToken ? `&access_token=${accessToken}` : "");
  const sign = createHmac("sha256", SHOPEE_SECRET_KEY)
    .update(baseString)
    .digest("hex");
  return { timestamp, sign };
}

function buildQueryString(path, accessToken) {
  const { timestamp, sign } = generateSign(path, accessToken);
  let qs = `?partner_id=${SHOPEE_PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`;
  if (accessToken) qs += `&access_token=${accessToken}`;
  if (SHOPEE_SHOP_ID) qs += `&shop_id=${SHOPEE_SHOP_ID}`;
  return qs;
}

export async function shopeeApiGet(path, accessToken) {
  const qs = buildQueryString(path, accessToken);
  const resp = await fetch(`${BASE_URL}${path}${qs}`);
  const data = await resp.json();
  return data;
}

export async function shopeeApiPost(path, body, accessToken) {
  const qs = buildQueryString(path, accessToken);
  const resp = await fetch(`${BASE_URL}${path}${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return data;
}

export async function refreshAccessToken(refreshToken) {
  const resp = await shopeeApiPost("/auth/access_token/get", {
    partner_id: Number(SHOPEE_PARTNER_ID),
    shop_id: Number(SHOPEE_SHOP_ID),
    refresh_token: refreshToken,
  });
  if (resp.error === 0 && resp.response) {
    return {
      access_token: resp.response.access_token,
      refresh_token: resp.response.refresh_token,
      expire_in: resp.response.expire_in,
    };
  }
  throw new Error(resp.message || "Failed to refresh token");
}

export async function getStoredToken() {
  const sb = await getAdmin();
  const { data } = await sb
    .from("shopee_tokens")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const now = new Date();
  const expiresAt = new Date(data.expires_at);
  if (now >= expiresAt) {
    try {
      const refreshed = await refreshAccessToken(data.refresh_token);
      const { error } = await sb.from("shopee_tokens").upsert({
        id: data.id,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expire_in * 1000).toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: "id" });
      if (error) console.error("[Shopee] Token save error:", error);
      return refreshed.access_token;
    } catch (e) {
      console.error("[Shopee] Token refresh failed:", e.message);
      return null;
    }
  }
  return data.access_token;
}

export async function ensureToken() {
  const token = await getStoredToken();
  if (!token) throw new Error("Shopee access token not configured. Please authorize first.");
  return token;
}

export async function uploadImage(imageUrl, scene = "normal") {
  const token = await ensureToken();
  const imgResp = await fetch(imageUrl);
  const buffer = await imgResp.arrayBuffer();
  const ext = imageUrl.split(".").pop().toLowerCase().replace(/\?.*$/, "");
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  const filename = `${randomUUID()}.${ext}`;
  const formData = new FormData();
  formData.append("image", new Blob([buffer], { type: mime }), filename);
  formData.append("scene", scene);
  const qs = buildQueryString("/media_space/upload_image", token);
  const resp = await fetch(`${BASE_URL}/media_space/upload_image${qs}`, {
    method: "POST",
    body: formData,
  });
  const data = await resp.json();
  if (data.error === 0 && data.response) {
    return data.response.image_info;
  }
  throw new Error(data.message || "Failed to upload image");
}

export async function addItem(itemData) {
  const token = await ensureToken();
  return shopeeApiPost("/product/add_item", itemData, token);
}

export async function initTierVariation(itemId, tierVariation) {
  const token = await ensureToken();
  return shopeeApiPost(
    "/product/init_tier_variation",
    { item_id: itemId, tier_variation: tierVariation },
    token
  );
}

export async function updateStock(itemId, stockList) {
  const token = await ensureToken();
  return shopeeApiPost(
    "/product/update_stock",
    { item_id: itemId, stock_list: stockList },
    token
  );
}

export async function updatePrice(itemId, priceList) {
  const token = await ensureToken();
  return shopeeApiPost(
    "/product/update_price",
    { item_id: itemId, price_list: priceList },
    token
  );
}

export async function getItemInfo(itemIds) {
  const token = await ensureToken();
  const idStr = Array.isArray(itemIds) ? itemIds.join(",") : itemIds;
  return shopeeApiGet(`/product/get_item?item_id_list=[${idStr}]`, token);
}

export async function getOrderList(startTime, endTime, cursor = "") {
  const token = await ensureToken();
  let path = `/order/get_order_list?create_time_from=${startTime}&create_time_to=${endTime}&page_size=50`;
  if (cursor) path += `&cursor=${cursor}`;
  return shopeeApiGet(path, token);
}

export async function getOrderDetail(orderSn) {
  const token = await ensureToken();
  return shopeeApiGet(`/order/get_order_detail?order_sn=${orderSn}`, token);
}

export async function shipOrder(orderSn, addressId) {
  const token = await ensureToken();
  return shopeeApiPost(
    "/logistics/ship_order",
    { order_sn: orderSn, address_id: addressId },
    token
  );
}

export function calculateShopeePrice(costPrice) {
  if (!costPrice || costPrice <= 0) return 0;
  return Math.ceil(costPrice * (1 + SHOPEE_MARKUP) / 500) * 500;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const action = url.searchParams.get("action");

    if (req.method === "POST") {
      const body = await new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(JSON.parse(data)));
      });

      if (action === "save_token") {
        const sb = await getAdmin();
        const { access_token, refresh_token, expires_in, shop_id } = body;
        if (!access_token || !refresh_token) {
          return json(res, 400, { error: "Missing tokens" });
        }
        const { error } = await sb.from("shopee_tokens").insert({
          access_token,
          refresh_token,
          expires_at: new Date(Date.now() + (expires_in || 14400) * 1000).toISOString(),
          shop_id: shop_id || SHOPEE_SHOP_ID,
        });
        if (error) throw error;
        return json(res, 200, { ok: true });
      }

      if (action === "upload_products") {
        const { product_ids } = body;
        const sb = await getAdmin();
        const results = [];
        for (const pid of product_ids) {
          const { data: product } = await sb
            .from("products")
            .select("*")
            .eq("id", pid)
            .single();
          if (!product) {
            results.push({ id: pid, error: "Product not found" });
            continue;
          }
          const shopeePrice = calculateShopeePrice(product.cost_price || 0);
          const shopeeWeight = product.weight || 250;
          let shopeeImageId = null;
          if (product.image) {
            try {
              const imgInfo = await uploadImage(product.image);
              shopeeImageId = imgInfo.image_id;
            } catch (e) {
              results.push({ id: pid, error: `Image upload failed: ${e.message}` });
              continue;
            }
          }
          const addItemBody = {
            category_id: product.shopee_category_id || 0,
            item_name: product.name,
            description: product.description || product.name,
            price: shopeePrice,
            stock: product.stock || 0,
            weight: shopeeWeight / 1000,
            condition: "NEW",
            item_sku: product.id,
            is_mortal: false,
            brand: { brand_id: 0, original_brand_name: "No Brand" },
          };
          if (shopeeImageId) {
            addItemBody.image_info = { image_id_list: [shopeeImageId] };
          }
          try {
            const addResp = await addItem(addItemBody);
            if (addResp.error !== 0) {
              results.push({ id: pid, error: addResp.message });
              continue;
            }
            const itemId = addResp.response.item_id;
            const variants = product.product_variants || [];
            if (variants.length > 0) {
              const tierVariation = [
                {
                  name: "Variant",
                  option_list: variants.map((v) => v.name),
                },
              ];
              const initResp = await initTierVariation(itemId, tierVariation);
              if (initResp.error !== 0) {
                results.push({
                  id: pid,
                  shopee_item_id: itemId,
                  warning: `Variants init failed: ${initResp.message}`,
                });
                continue;
              }
              const modelList = (initResp.response.model || []).map((m, i) => ({
                model_id: m.model_id,
                price: shopeePrice,
                stock: variants[i]?.stock || 0,
                sku: variants[i]?.id || "",
                name: variants[i]?.name,
              }));
              if (modelList.length > 0) {
                await updateStock(itemId, modelList.map((m) => ({
                  model_id: m.model_id,
                  stock: m.stock,
                  seller_sku: m.sku,
                })));
                await updatePrice(itemId, modelList.map((m) => ({
                  model_id: m.model_id,
                  price: m.price,
                })));
              }
            }
            await sb.from("products").update({
              shopee_item_id: String(itemId),
              shopee_synced_at: new Date().toISOString(),
            }).eq("id", pid);
            for (const v of variants) {
              if (v.id) {
                await sb.from("product_variants").update({
                  shopee_model_id: String(initResp.response?.model?.[variants.indexOf(v)]?.model_id || ""),
                }).eq("id", v.id);
              }
            }
            results.push({ id: pid, shopee_item_id: itemId, ok: true });
          } catch (e) {
            results.push({ id: pid, error: e.message });
          }
        }
        return json(res, 200, { results });
      }

      if (action === "sync_stock") {
        const { product_ids } = body;
        const sb = await getAdmin();
        const results = [];
        const ids = product_ids || [];
        let query = sb.from("products").select("*, product_variants(*)").not("shopee_item_id", "is", null);
        if (ids.length > 0) query = query.in("id", ids);
        const { data: products } = await query;
        for (const product of products || []) {
          const itemId = Number(product.shopee_item_id);
          if (!itemId) continue;
          const variants = product.product_variants || [];
          if (variants.length > 0) {
            const stockList = variants.map((v) => ({
              model_id: Number(v.shopee_model_id),
              stock: v.stock || 0,
              seller_sku: v.id || "",
            })).filter((s) => s.model_id);
            if (stockList.length > 0) {
              try {
                const resp = await updateStock(itemId, stockList);
                results.push({ id: product.id, ok: resp.error === 0, message: resp.message });
              } catch (e) {
                results.push({ id: product.id, error: e.message });
              }
            }
          } else {
            try {
              const resp = await updateStock(itemId, [{
                model_id: 0,
                stock: product.stock || 0,
                seller_sku: product.id,
              }]);
              results.push({ id: product.id, ok: resp.error === 0, message: resp.message });
            } catch (e) {
              results.push({ id: product.id, error: e.message });
            }
          }
        }
        return json(res, 200, { results });
      }

      if (action === "sync_price") {
        const { product_ids } = body;
        const sb = await getAdmin();
        const results = [];
        const ids = product_ids || [];
        let query = sb.from("products").select("*, product_variants(*)").not("shopee_item_id", "is", null);
        if (ids.length > 0) query = query.in("id", ids);
        const { data: products } = await query;
        for (const product of products || []) {
          const itemId = Number(product.shopee_item_id);
          if (!itemId) continue;
          const shopeePrice = calculateShopeePrice(product.cost_price || 0);
          const variants = product.product_variants || [];
          if (variants.length > 0) {
            const priceList = variants.map((v) => ({
              model_id: Number(v.shopee_model_id),
              price: shopeePrice,
            })).filter((p) => p.model_id);
            if (priceList.length > 0) {
              try {
                const resp = await updatePrice(itemId, priceList);
                results.push({ id: product.id, ok: resp.error === 0, message: resp.message });
              } catch (e) {
                results.push({ id: product.id, error: e.message });
              }
            }
          } else {
            try {
              const resp = await updatePrice(itemId, [{
                model_id: 0,
                price: shopeePrice,
              }]);
              results.push({ id: product.id, ok: resp.error === 0, message: resp.message });
            } catch (e) {
              results.push({ id: product.id, error: e.message });
            }
          }
        }
        return json(res, 200, { results });
      }

      if (action === "sync_all") {
        const sb = await getAdmin();
        const { product_ids } = body;
        const results = [];
        const ids = product_ids || [];
        let query = sb.from("products").select("*, product_variants(*)").not("shopee_item_id", "is", null);
        if (ids.length > 0) query = query.in("id", ids);
        const { data: products } = await query;
        for (const product of products || []) {
          const itemId = Number(product.shopee_item_id);
          if (!itemId) continue;
          const shopeePrice = calculateShopeePrice(product.cost_price || 0);
          const variants = product.product_variants || [];
          let stockOk = false, priceOk = false;
          try {
            if (variants.length > 0) {
              const stockList = variants.map((v) => ({
                model_id: Number(v.shopee_model_id), stock: v.stock || 0, seller_sku: v.id || "",
              })).filter((s) => s.model_id);
              const priceList = variants.map((v) => ({
                model_id: Number(v.shopee_model_id), price: shopeePrice,
              })).filter((p) => p.model_id);
              if (stockList.length > 0) await updateStock(itemId, stockList);
              if (priceList.length > 0) await updatePrice(itemId, priceList);
            } else {
              await updateStock(itemId, [{ model_id: 0, stock: product.stock || 0, seller_sku: product.id }]);
              await updatePrice(itemId, [{ model_id: 0, price: shopeePrice }]);
            }
            stockOk = true;
            priceOk = true;
          } catch (e) {
            results.push({ id: product.id, error: e.message });
          }
          await sb.from("products").update({
            shopee_synced_at: new Date().toISOString(),
          }).eq("id", product.id);
          results.push({ id: product.id, stock: stockOk, price: priceOk, ok: true });
        }
        return json(res, 200, { results });
      }
    }

    if (req.method === "GET") {
      if (action === "status") {
        const sb = await getAdmin();
        const { data: products } = await sb
          .from("products")
          .select("id, name, shopee_item_id, shopee_synced_at")
          .not("shopee_item_id", "is", null)
          .order("name");
        const { data: tokens } = await sb
          .from("shopee_tokens")
          .select("id, shop_id, expires_at, created_at")
          .order("created_at", { ascending: false })
          .limit(1);
        return json(res, 200, {
          synced_count: products?.length || 0,
          products: products || [],
          token: tokens?.[0] || null,
          configured: !!SHOPEE_PARTNER_ID && !!SHOPEE_SECRET_KEY,
        });
      }

      if (action === "unsynced") {
        const sb = await getAdmin();
        const { data: products } = await sb
          .from("products")
          .select("id, name, shopee_item_id")
          .is("shopee_item_id", null)
          .order("name");
        return json(res, 200, { products: products || [] });
      }

      if (action === "categories") {
        const token = await ensureToken();
        const resp = await shopeeApiGet("/product/get_category_tree", token);
        return json(res, 200, resp);
      }
    }

    return json(res, 400, { error: "Invalid action" });
  } catch (e) {
    console.error("[Shopee]", e);
    return json(res, 500, { error: e.message });
  }
}
