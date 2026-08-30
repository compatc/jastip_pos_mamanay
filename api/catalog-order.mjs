import { getAdmin } from "./pay.mjs";
import { randomUUID } from "node:crypto";
import { logAudit } from "./_audit.mjs";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const sb = await getAdmin();

    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const ogId = url.searchParams.get("og");

      if (ogId) {
        const { data: product } = await sb.from("products").select("name, sell_price, description, image, images, stock_type").eq("id", ogId).single();
        const name = product?.name || "Produk";
        const desc = product?.description ? product.description.slice(0, 160).replace(/\n/g, " ").replace(/<[^>]*>/g, "") : "Jastip produk import berkualitas";
        const img = (product?.images && product.images.length > 0 ? product.images[0] : product?.image) || "https://tmnykmpdqdavspmirspw.supabase.co/storage/v1/object/public/products/products/f78b4d77-8db7-45bf-bd29-685b0db90ce4.jpg";
        const siteUrl = `https://mamanay.vercel.app/catalog/${ogId}`;
        const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${name} - jastip_mamanay</title><meta property="og:type" content="product"><meta property="og:title" content="${name} - jastip_mamanay"><meta property="og:description" content="${desc}"><meta property="og:image" content="${img}"><meta property="og:url" content="${siteUrl}"><meta property="og:site_name" content="jastip_mamanay"><meta property="product:price:amount" content="${product?.sell_price || ""}"><meta property="product:price:currency" content="IDR"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${name} - jastip_mamanay"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${img}"><script>window.location.href="/catalog/${ogId}";</script></head><body><p>Membuka <a href="/catalog/${ogId}">${name}</a>...</p></body></html>`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
        res.writeHead(200);
        res.end(html);
        return;
      }

      const ogTag = url.searchParams.get("ogTag");
      if (ogTag) {
        const { data: tagRow } = await sb.from("tags").select("id").ilike("name", ogTag).maybeSingle();
        let products = [];
        if (tagRow) {
          const { data: tagged } = await sb.from("product_tags").select("product_id").eq("tag_id", tagRow.id);
          const tagProductIds = (tagged || []).map((t) => t.product_id);
          if (tagProductIds.length > 0) {
            const { data: prods } = await sb.from("products").select("name, sell_price, image, images").in("id", tagProductIds).order("name");
            products = prods || [];
          }
        }
        const displayName = ogTag.charAt(0).toUpperCase() + ogTag.slice(1);
        const firstImg = products.length > 0 ? ((products[0].images && products[0].images.length > 0) ? products[0].images[0] : products[0].image) || null : null;
        const img = firstImg || "https://tmnykmpdqdavspmirspw.supabase.co/storage/v1/object/public/products/products/f78b4d77-8db7-45bf-bd29-685b0db90ce4.jpg";
        const productList = products.slice(0, 5).map(p => `${p.name} Rp${p.sell_price?.toLocaleString("id-ID")}`).join(", ");
        const desc = products.length > 0 ? `${displayName}: ${productList}${products.length > 5 ? ` dan ${products.length - 5} produk lainnya` : ""}` : `Produk ${displayName} - jastip_mamanay`;
        const siteUrl = `https://mamanay.vercel.app/catalog?tag=${ogTag}`;
        const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${displayName} - jastip_mamanay</title><meta property="og:type" content="website"><meta property="og:title" content="${displayName} - jastip_mamanay"><meta property="og:description" content="${desc}"><meta property="og:image" content="${img}"><meta property="og:url" content="${siteUrl}"><meta property="og:site_name" content="jastip_mamanay"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${displayName} - jastip_mamanay"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${img}"><script>window.location.href="/catalog?tag=${ogTag}";</script></head><body><p>Membuka <a href="/catalog?tag=${ogTag}">${displayName}</a>...</p></body></html>`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
        res.writeHead(200);
        res.end(html);
        return;
      }

      const promoRec = url.searchParams.get("promoRec");
      if (promoRec !== null) {
        const pDays = parseInt(url.searchParams.get("days") || "30");
        const pMinStock = parseInt(url.searchParams.get("minStock") || "3");
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - pDays);
        const cutoffISO = cutoffDate.toISOString();

        const { data: prods } = await sb.from("products")
          .select("id, name, sell_price, cost_price, stock, stock_type, image, images, supplier")
          .gt("stock", 0).order("name");

        const { data: rItems } = await sb.from("order_items")
          .select("product_name, product_id, quantity, order_id")
          .gte("created_at", cutoffISO);

        const rOrderIds = [...new Set((rItems || []).map(i => i.order_id))];
        const { data: rOrders } = await sb.from("orders")
          .select("id, order_type").in("id", rOrderIds).eq("order_type", "penjualan");
        const penjualanIds = new Set((rOrders || []).map(o => o.id));
        const pItems = (rItems || []).filter(i => penjualanIds.has(i.order_id));

        const salesById = {};
        const salesByName = {};
        for (const item of pItems) {
          const n = (item.product_name || "").toLowerCase().replace(/\[.*?\]|\b(ready|readyh|po)\b/gi, "").trim();
          salesByName[n] = (salesByName[n] || 0) + item.quantity;
          if (item.product_id) salesById[item.product_id] = (salesById[item.product_id] || 0) + item.quantity;
        }

        const recs = [];
        for (const p of (prods || [])) {
          if (p.stock < pMinStock || p.stock_type === "po") continue;
          const cn = p.name.toLowerCase().replace(/\[.*?\]|\b(ready|readyh|po)\b/gi, "").trim();
          const sold = salesById[p.id] || salesByName[cn] || 0;
          const ratio = p.stock > 0 ? sold / p.stock : 1;
          if (ratio >= 0.3 && sold > 0) continue;

          const discountedPrice20 = Math.round(p.sell_price * 0.8);
          const discountedPrice15 = Math.round(p.sell_price * 0.85);
          const costPrice = p.cost_price || 0;
          const minProfit = 6000;

          let promoType = "discount", promoValue = 15, promoMsg = "";

          if (p.stock >= 15 && (discountedPrice15 - costPrice) >= minProfit) {
            const bundleQty = p.stock >= 20 ? 3 : 2;
            const bundleDiscount = p.stock >= 20 ? 25 : 15;
            const bundlePrice = Math.round(p.sell_price * (1 - bundleDiscount / 100));
            const bundleTotal = bundlePrice * bundleQty;
            const normalTotal = p.sell_price * bundleQty;
            const bundleSaving = normalTotal - bundleTotal;
            promoType = "bundling"; promoValue = bundleDiscount;
            promoMsg = `🏷️ ${p.name} ${bundlePrice.toLocaleString("id-ID")}\n[stok:${p.stock}]\n🎁 BUNDLING Beli ${bundleQty} Lebih Hemat!\nHarga normal: Rp${p.sell_price.toLocaleString("id-ID")}/pcs\nBeli ${bundleQty} pcs: *Rp${bundlePrice.toLocaleString("id-ID")}/pcs*\n💡 Hemat Rp${bundleSaving.toLocaleString("id-ID")} untuk ${bundleQty} pcs!`;
          } else if (p.stock >= 5 && (discountedPrice15 - costPrice) >= minProfit) {
            const bundleQty = 2;
            const bundleDiscount = 10;
            const bundlePrice = Math.round(p.sell_price * (1 - bundleDiscount / 100));
            const bundleTotal = bundlePrice * bundleQty;
            const normalTotal = p.sell_price * bundleQty;
            const bundleSaving = normalTotal - bundleTotal;
            promoType = "bundling"; promoValue = bundleDiscount;
            promoMsg = `🏷️ ${p.name} ${bundlePrice.toLocaleString("id-ID")}\n[stok:${p.stock}]\n🎁 BUNDLING Beli 2 Lebih Hemat!\nHarga normal: Rp${p.sell_price.toLocaleString("id-ID")}/pcs\nBeli 2 pcs: *Rp${bundlePrice.toLocaleString("id-ID")}/pcs*\n💡 Hemat Rp${bundleSaving.toLocaleString("id-ID")} untuk 2 pcs!`;
          } else if (sold === 0 && p.stock >= 5 && (discountedPrice20 - costPrice) >= minProfit) {
            promoType = "flash_sale"; promoValue = 20;
            promoMsg = `🏷️ ${p.name} ${discountedPrice20.toLocaleString("id-ID")}\n[stok:${p.stock}]\n🔥 FLASH SALE!\nRp${p.sell_price.toLocaleString("id-ID")} → *Rp${discountedPrice20.toLocaleString("id-ID")}* (hemat Rp${(p.sell_price - discountedPrice20).toLocaleString("id-ID")})\nBuruan sebelum kehabisan!`;
          } else if ((discountedPrice15 - costPrice) < minProfit) {
            continue;
          } else {
            promoMsg = `🏷️ ${p.name} ${discountedPrice15.toLocaleString("id-ID")}\n[stok:${p.stock}]\n🏷️ DISKON ${promoValue}%\nRp${p.sell_price.toLocaleString("id-ID")} → *Rp${discountedPrice15.toLocaleString("id-ID")}* (hemat Rp${(p.sell_price - discountedPrice15).toLocaleString("id-ID")})\nBuruan sebelum kehabisan!`;
          }
          recs.push({
            id: p.id, name: p.name, price: p.sell_price, stock: p.stock,
            soldLast30Days: sold, salesRatio: Math.round(ratio * 100),
            supplier: p.supplier || "", image: (p.images?.[0]) || p.image || null,
            promoType, promoValue, promoMsg,
          });
        }
        recs.sort((a, b) => b.stock - a.stock);

        json(res, 200, { ok: true, days: pDays, minStock: pMinStock, totalProducts: (prods || []).length, recommendations: recs });
        return;
      }

      res.setHeader("Cache-Control", "public, max-age=60");

      const tagFilter = url.searchParams.get("tag");

      let query = sb
        .from("products")
        .select("id, name, description, sell_price, stock, stock_type, po_closed, unit, image, images")
        .order("name", { ascending: true });

      if (tagFilter) {
        const { data: tagRow } = await sb.from("tags").select("id").ilike("name", tagFilter).maybeSingle();
        if (tagRow) {
          const { data: tagged } = await sb.from("product_tags").select("product_id").eq("tag_id", tagRow.id);
          const tagProductIds = (tagged || []).map((t) => t.product_id);
          if (tagProductIds.length === 0) {
            json(res, 200, { ok: true, data: [], tag: tagFilter });
            return;
          }
          query = query.in("id", tagProductIds);
        } else {
          json(res, 200, { ok: true, data: [], tag: tagFilter });
          return;
        }
      }

      const { data, error } = await query;
      if (error) {
        json(res, 500, { error: error.message });
        return;
      }

      const { data: allTags } = await sb.from("tags").select("id, name");
      const { data: allProductTags } = await sb.from("product_tags").select("product_id, tag_id");
      const tagMap = {};
      for (const t of allTags || []) tagMap[t.id] = t.name;
      const productTagMap = {};
      for (const pt of allProductTags || []) {
        if (!productTagMap[pt.product_id]) productTagMap[pt.product_id] = [];
        const tagName = tagMap[pt.tag_id];
        if (tagName) productTagMap[pt.product_id].push(tagName);
      }

      const { data: variants } = await sb
        .from("product_variants")
        .select("id, product_id, name, image, stock, stock_type");
      const { data: movements } = await sb
        .from("stock_movements")
        .select("product_id, variant, qty");

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
        // Update variant details stock too
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

      json(res, 200, { ok: true, data: result, tag: tagFilter || null });
      return;
    }

    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const isBotOrder = url.searchParams.get("type") === "bot";

    if (isBotOrder) {
      // Bot order: use service role, no auth check needed (already protected by Bearer)
      const { items, customer_name, phone, notes, payment_type, paid_total, order_type } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        json(res, 400, { error: "items wajib diisi" });
        return;
      }

      // Check po_closed for bot orders (product_id may be null, match by name)
      for (const item of items) {
        let productName = (item.product_name || "").replace(/\[.*?\]/g, "").trim();
        if (!productName) continue;
        const { data: botPoCheck } = await sb.from("products").select("id, po_closed, stock_type").ilike("name", "%" + productName + "%").limit(1);
        const poMatch = (botPoCheck || []).find((p) => p.po_closed && p.stock_type === "po");
        if (poMatch) {
          json(res, 400, { error: "PO ditutup: " + (item.product_name || productName) });
          return;
        }
      }

      let subtotal = 0;
      for (const item of items) {
        subtotal += (item.price || 0) * (item.quantity || 1);
      }

      const orderId = randomUUID();
      const now = new Date().toISOString();

      let customerId = null;
      if (customer_name && phone) {
        // Normalize phone: strip non-digits, ensure starts with 62
        const norm = (s) => {
          let d = s.replace(/[^0-9]/g, "").replace(/^0+/, "");
          if (d.startsWith("62")) d = d;
          else if (d.startsWith("8")) d = "62" + d;
          return d;
        };
        const phoneNorm = norm(phone);

        // Fetch all customers and match with flexible normalization
        const { data: allCustomers } = await sb
          .from("customers")
          .select("id, name, phone");

        const matched = (allCustomers || []).find((c) => {
          const cNorm = norm(c.phone || "");
          if (!cNorm || !phoneNorm) return false;
          return cNorm === phoneNorm || cNorm.endsWith(phoneNorm.slice(-10)) || phoneNorm.endsWith(cNorm.slice(-10));
        });

        if (matched) {
          customerId = matched.id;
          console.log("bot-order: matched customer", customerId, matched.name);
        } else {
          customerId = randomUUID();
          await sb.from("customers").insert({
            id: customerId, name: customer_name, phone: phoneNorm, address: "",
            category: "pelanggan", points: 0, total_spent: 0,
            member_level: "silver", created_at: now,
          });
          console.log("bot-order: created new customer", customerId, customer_name);
        }
      }

      const { error: orderErr } = await sb.from("orders").insert({
        id: orderId,
        customer_id: customerId || "",
        status: "new",
        payment_status: paid_total >= subtotal ? "paid" : "unpaid",
        fulfillment_status: "belum_ready",
        total: subtotal,
        paid_total: paid_total || 0,
        refund_total: 0,
        diskon: 0,
        order_type: order_type || "penjualan",
        payment_type: payment_type || "qris",
        ongkir: 0,
        notes: notes || "",
        qris_notes: "",
        account_id: null,
        created_at: now,
        updated_at: now,
      });
      if (orderErr) {
        json(res, 500, { error: "Gagal buat order: " + orderErr.message });
        return;
      }

      await logAudit(sb, {
        orderId,
        action: "order_created",
        oldPaidTotal: null,
        newPaidTotal: paid_total || 0,
        oldPaymentStatus: null,
        newPaymentStatus: paid_total >= subtotal ? "paid" : "unpaid",
        performedBy: "catalog-order.mjs:bot-order"
      });

      for (const item of items) {
        // Lookup product_id by name if not provided
        let productId = item.product_id || null;
        if (!productId && item.product_name) {
          const cleanName = item.product_name.replace(/\[.*?\]|\b(ready|readyh|po)\b/gi, '').replace(/\s+/g, ' ').trim();
          // Try exact match first (avoid .or() which breaks with parentheses in names)
          let { data: prodMatch } = await sb.from("products").select("id").eq("name", item.product_name).limit(1);
          if (!prodMatch || prodMatch.length === 0) {
            const { data: fuzzyMatch } = await sb.from("products").select("id").ilike("name", "%" + cleanName + "%").limit(1);
            if (fuzzyMatch && fuzzyMatch.length > 0) prodMatch = fuzzyMatch;
          }
          if (prodMatch && prodMatch.length > 0) productId = prodMatch[0].id;
        }

        // Extract variant from product_name if not provided
        let variant = item.variant || null;
        if (!variant && productId && item.product_name) {
          const { data: prodVariants } = await sb.from("product_variants").select("name").eq("product_id", productId);
          for (const pv of (prodVariants || [])) {
            if (item.product_name.toLowerCase().endsWith(pv.name.toLowerCase())) {
              variant = pv.name;
              break;
            }
          }
        }

        const { error: itemErr } = await sb.from("order_items").insert({
          id: randomUUID(), order_id: orderId,
          product_id: productId,
          product_name: item.product_name || item.name || "Produk",
          price: item.price || 0,
          quantity: item.quantity || 1,
          discount: 0, paid_value: 0, status: "new",
          variant: variant,
        });
        if (itemErr) console.error("bot-order item:", itemErr.message);

        // Create stock movement if product_id found
        if (productId) {
          const { data: prod } = await sb.from("products").select("id, stock, unit").eq("id", productId).single();
          if (prod) {
            const qty = -(item.quantity || 1);
            const newStock = (prod.stock || 0) + qty;
            await sb.from("products").update({ stock: newStock }).eq("id", prod.id);
            const { data: maxInv } = await sb.from("stock_movements").select("invoice_no").order("invoice_no", { ascending: false }).limit(1).maybeSingle();
            const nextInv = ((maxInv?.invoice_no) || 0) + 1;
            await sb.from("stock_movements").insert({
              id: randomUUID(), product_id: prod.id, order_id: orderId,
              date: now.split("T")[0], transaction_type: "Penjualan",
              invoice_no: nextInv, party_name: customer_name || "",
              qty, qty_after: newStock, unit: prod.unit || "PCS",
              variant: variant, created_at: now,
            });
          }
        }
      }

      json(res, 200, { ok: true, orderId, total: subtotal });
      return;
    }

    const { items, customer_name, phone, address, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      json(res, 400, { error: "items wajib diisi" });
      return;
    }

    const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
    if (productIds.length > 0) {
      const { data: poProducts } = await sb.from("products").select("id, po_closed, stock_type").in("id", productIds);
      const closedIds = (poProducts || []).filter((p) => p.po_closed && p.stock_type === "po").map((p) => p.id);
      if (closedIds.length > 0) {
        const closedNames = (items || []).filter((i) => closedIds.includes(i.product_id)).map((i) => i.product_name || i.name || "Produk");
        json(res, 400, { error: "PO sudah ditutup untuk: " + [...new Set(closedNames)].join(", ") });
        return;
      }
    }

    if (!customer_name || !customer_name.trim()) {
      json(res, 400, { error: "Nama wajib diisi" });
      return;
    }
    if (!phone || !phone.trim()) {
      json(res, 400, { error: "No. WhatsApp wajib diisi" });
      return;
    }

    const { data: existingCustomers, error: searchErr } = await sb
      .from("customers")
      .select("id, name, phone")
      .or(`name.ilike.%${customer_name.trim()}%,phone.ilike.%${phone.trim()}%`)
      .limit(5);

    if (searchErr) {
      json(res, 500, { error: searchErr.message });
      return;
    }

    let customerId = "";
    let customerDbName = customer_name.trim();
    const normalizedPhone = phone.trim().replace(/\D/g, "");
    const matched = (existingCustomers || []).find((c) => {
      const cp = (c.phone || "").replace(/\D/g, "");
      if (!cp || !normalizedPhone) return false;
      return cp === normalizedPhone || cp.endsWith(normalizedPhone) || normalizedPhone.endsWith(cp);
    });

    if (matched) {
      customerId = matched.id;
      customerDbName = matched.name;
    } else {
      customerId = randomUUID();
      const { error: cErr } = await sb.from("customers").insert({
        id: customerId,
        name: customer_name.trim(),
        phone: phone.trim(),
        address: address || "",
        category: "pelanggan",
        created_at: new Date().toISOString(),
      });
      if (cErr) {
        json(res, 500, { error: "Gagal buat pelanggan: " + cErr.message });
        return;
      }
    }

    const orderId = randomUUID();
    const now = new Date().toISOString();
    let subtotal = 0;
    for (const item of items) {
      subtotal += (item.price || 0) * (item.quantity || 1);
    }

    const { error: orderErr } = await sb.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      status: "new",
      total: subtotal,
      paid_total: 0,
      order_type: "penjualan",
      payment_type: "qris",
      ongkir: 0,
      notes: notes || "",
      created_at: now,
      updated_at: now,
    });
    if (orderErr) {
      json(res, 500, { error: "Gagal buat order: " + orderErr.message });
      return;
    }

    await logAudit(sb, {
      orderId,
      action: "order_created",
      oldPaidTotal: null,
      newPaidTotal: 0,
      oldPaymentStatus: null,
      newPaymentStatus: "unpaid",
      performedBy: "catalog-order.mjs:catalog-order"
    });

    for (const item of items) {
      const { error: iErr } = await sb.from("order_items").insert({
        id: randomUUID(),
        order_id: orderId,
        product_id: item.product_id || null,
        product_name: item.product_name || item.name || "Produk",
        price: item.price || 0,
        quantity: item.quantity || 1,
        discount: 0,
        paid_value: 0,
        status: "new",
      });
      if (iErr) {
        console.error("catalog-order item insert error:", iErr.message);
      }
    }

    const adminPhone = process.env.ADMIN_PHONE || process.env.VITE_ADMIN_PHONE || "6285894652806";
    let botUrl = process.env.VITE_BOT_API_URL || "https://hardship-broadly-mammogram.ngrok-free.dev";
    try {
      const { data: settings } = await sb.from("settings").select("value").eq("key", "bot_api_url").maybeSingle();
      if (settings?.value) botUrl = settings.value;
    } catch (_) {}

    const itemList = items.map((i) => `• ${i.product_name || i.name} x${i.quantity || 1} = Rp ${((i.price || 0) * (i.quantity || 1)).toLocaleString("id-ID")}`).join("\n");
    let waMsg = "🛒 *Order dari Catalog*\n\n";
    waMsg += "👤 " + customer_name.trim() + "\n";
    waMsg += "📱 " + phone.trim() + "\n";
    if (address?.trim()) waMsg += "📍 " + address.trim() + "\n";
    if (notes?.trim()) waMsg += "📝 " + notes.trim() + "\n";
    waMsg += "\n📦 *Detail:*\n" + itemList + "\n";
    waMsg += "\n💰 *Total: Rp " + subtotal.toLocaleString("id-ID") + "*\n";
    waMsg += "📋 Status: Baru\n\n";
    waMsg += "───────────\n";
    waMsg += "Link: https://mamanay.vercel.app/orders/" + orderId;

    await fetch(botUrl + "/api/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (process.env.BOT_API_TOKEN || "mamanay2026") },
      body: JSON.stringify({ phone: adminPhone, message: waMsg }),
    });

    json(res, 200, { ok: true, orderId, total: subtotal, customerName: customerDbName });
  } catch (e) {
    console.error("catalog-order error:", e.message);
    json(res, 500, { error: e.message });
  }
}
