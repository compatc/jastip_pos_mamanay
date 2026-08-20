/**
 * Bot WhatsApp (Baileys) + Supabase — tinggal jalan.
 *
 * Cara pakai:
 *   1. npm install @whiskeysockets/baileys qrcode-terminal
 *   2. pastikan .env punya SUPABASE_URL, SUPABASE_ANON_KEY, BOT_EMAIL, BOT_PASSWORD
 *   3. node bot/wa-bot.js
 *
 * Pertama kali akan muncul QR di terminal — scan pakai WhatsApp > Linked Devices.
 * Sesi tersimpan di folder wa-auth, jadi login berikutnya tidak perlu scan lagi.
 */
import "dotenv/config";
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { Boom } from "@hapi/boom";
import { BotApi, handleBotMessage } from "./supabase-bot.js";

const api = new BotApi();
await api.login(process.env.BOT_EMAIL, process.env.BOT_PASSWORD);
console.log("Login Supabase sukses, bot siap.");

const { state, saveCreds } = await useMultiFileAuthState("wa-auth");
const sock = makeWASocket({
  auth: state,
  printQRInTerminal: false,
});

sock.ev.on("creds.update", saveCreds);

sock.ev.on("connection.update", (update) => {
  const { connection, lastDisconnect, qr } = update;
  if (qr) {
    console.log("\nScan QR ini dengan WhatsApp > Perangkat Tertaut:");
    qrcode.generate(qr, { small: true });
  }
  if (connection === "close") {
    const code = lastDisconnect?.error instanceof Boom
      ? lastDisconnect.error.output.statusCode
      : null;
    const shouldReconnect = code !== DisconnectReason.loggedOut;
    console.log(`Koneksi ditutup (${code}). Reconnect: ${shouldReconnect}`);
    if (shouldReconnect) {
      setTimeout(() => process.exit(0), 1000);
    }
  }
  if (connection === "open") {
    console.log("WhatsApp terhubung.");
  }
});

async function onIncomingMessage(remoteJid, text) {
  try {
    const reply = await handleBotMessage(api, remoteJid, text);

    if (reply.startsWith("{")) {
      const action = JSON.parse(reply);

      if (action.action === "send_invoice") {
        if (action.phone) {
          const waJid = normalizeWaJid(action.phone);
          if (waJid) {
            await sock.sendMessage(waJid, { text: action.msg });
            await sock.sendMessage(remoteJid, { text: `✅ Invoice dikirim ke ${action.customerName}` });
          } else {
            await sock.sendMessage(remoteJid, { text: `❌ Nomor WA tidak valid untuk ${action.customerName}` });
          }
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ ${action.customerName} tidak punya nomor WA.` });
        }
        return;
      }

      if (action.action === "send_batch") {
        let sent = 0;
        let failed = 0;
        const failedNames = [];

        for (const inv of action.invoices) {
          if (inv.phone) {
            const waJid = normalizeWaJid(inv.phone);
            if (waJid) {
              try {
                await sock.sendMessage(waJid, { text: inv.msg });
                sent++;
                await new Promise((r) => setTimeout(r, 2000));
              } catch {
                failed++;
                failedNames.push(inv.name);
              }
            } else {
              failed++;
              failedNames.push(inv.name);
            }
          } else {
            failed++;
            failedNames.push(inv.name);
          }
        }

        let summary = `✅ Invoice terkirim: ${sent}/${action.count}`;
        if (failed > 0) {
          summary += `\n❌ Gagal: ${failed} (${failedNames.join(", ")})`;
        }
        await sock.sendMessage(remoteJid, { text: summary });
        return;
      }
    }

    await sock.sendMessage(remoteJid, { text: reply });
  } catch (e) {
    await sock.sendMessage(remoteJid, { text: "Error: " + e.message });
  }
}

function normalizeWaJid(phone) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (!digits.startsWith("62")) digits = "62" + digits;
  return digits + "@s.whatsapp.net";
}

// Track produk dari pesan admin di group: { chatJid: [{ msgId, name, price }] }
const productMessages = {};

sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify") return;
  const m = messages[0];
  if (!m?.message) return;
  if (m.key.fromMe) return;
  const isGroup = m.key.remoteJid?.endsWith("@g.us");
  const chatJid = m.key.remoteJid;
  const msgId = m.key.id;
  const text = m.message.conversation
    || m.message.extendedTextMessage?.text
    || "";
  const caption = m.message.imageMessage?.caption
    || m.message.videoMessage?.caption
    || "";

  // === GROUP ===
  if (isGroup) {
    console.log(`[GROUP] JID: ${chatJid} | From: ${m.key.participant} | Text: ${text || caption}`);
    const msgText = text || caption;

    // 1) Admin kirim foto dengan caption "🏷️ NamaProduk 25000"
    const tagMatch = caption.match(/🏷️\s*(.+)/);
    if (tagMatch) {
      const line = tagMatch[1].trim();
      const parts = line.split(/\s+/);
      const priceStr = parts.pop();
      const price = parseInt(priceStr, 10);
      const name = parts.join(" ").trim();
      if (name && price > 0) {
        if (!productMessages[chatJid]) productMessages[chatJid] = [];
        productMessages[chatJid].unshift({ msgId, name, price });
        if (productMessages[chatJid].length > 50) productMessages[chatJid].pop();
        const senderJid = m.key.participant || m.key.remoteJid;
        await sock.sendMessage(senderJid, { text: `✅ Produk ditandai: *${name}* — Rp ${price.toLocaleString("id-ID")}` });
      } else {
        const senderJid = m.key.participant || m.key.remoteJid;
        await sock.sendMessage(senderJid, { text: "Format: 🏷️ NamaProduk Harga\nContoh: 🏷️ Blindbox Stitch 25000" });
      }
      return;
    }

    // 2) Cek apakah ini reply ke foto produk
    const quotedId = m.message.extendedTextMessage?.contextInfo?.stanzaId;

    if (quotedId && productMessages[chatJid]) {
      const product = productMessages[chatJid].find((p) => p.msgId === quotedId);
      if (product) {
        const qtyMatch = (text || "").match(/^(\d+)/);
        if (qtyMatch) {
          const qty = parseInt(qtyMatch[1], 10);
          if (qty > 0) {
            try {
              const senderJid = m.key.participant || m.key.remoteJid || "";
              const senderPhone = senderJid.replace(/@.*/, "").replace(/^62/, "0");
              const senderName = m.pushName || "Group Customer";

              const existingCustomers = await api.searchCustomers(senderPhone);
              const existing = existingCustomers.find((c) => c.phone && senderPhone && c.phone.replace(/\D/g, "").endsWith(senderPhone.replace(/\D/g, "")));

              const result = await api.createOrder({
                orderType: "penjualan",
                paymentType: "cash",
                contactName: existing ? existing.name : senderName,
                contactPhone: existing ? existing.phone : senderPhone,
                items: [{ product_name: product.name, quantity: qty, price: product.price }],
                notes: "Order dari WhatsApp group",
              });
              const total = product.price * qty;
              const adminPhone = "6285894652806";
              let adminMsg = "🛒 *Order dari Group*\n\n";
              adminMsg += "👤 " + (existing ? existing.name : senderName) + "\n";
              adminMsg += "📦 " + qty + "× " + product.name + "\n";
              adminMsg += "💰 Total: Rp " + total.toLocaleString("id-ID") + "\n";
              adminMsg += "Link: https://mamanay.vercel.app/orders/" + result.orderId;
              try {
                const { data: settings } = await api.sb.from("settings").select("value").eq("key", "bot_api_url").maybeSingle();
                const botApiUrl = settings?.value || "https://hardship-broadly-mammogram.ngrok-free.dev";
                await fetch(botApiUrl + "/send-message", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phone: adminPhone, message: adminMsg }),
                });
              } catch (_) {}
              return;
            } catch (e) {
              return;
            }
          }
        }
        return;
      }
    }

    // 3) Command: pesan
    const lower = msgText.trim().toLowerCase();
    if (lower.startsWith("pesan") || lower.startsWith("/pesan")) {
      await onIncomingMessage(chatJid, text);
      return;
    }

    return;
  }

  // === PRIVATE CHAT ===
  await onIncomingMessage(chatJid, text);
});

console.log("Bot berjalan.");
console.log("  Private: stok, cari, order, kiriminvoice, kirimsemua, bantuan");
console.log("  Group:   kirim foto + caption 🏷️ Nama Harga — tandai produk");
console.log("           reply foto dengan angka — buat order");
