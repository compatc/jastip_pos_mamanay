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

    // Handle JSON actions (invoice sending)
    if (reply.startsWith("{")) {
      const action = JSON.parse(reply);

      if (action.action === "send_invoice") {
        // Send invoice to single customer
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
        // Send batch invoices
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
                // Delay between messages to avoid rate limit
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

    // Default: send text reply
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

sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify") return;
  const m = messages[0];
  if (!m?.message) return;
  if (m.key.fromMe) return;
  if (m.key.remoteJid?.endsWith("@g.us")) return;
  const text = m.message.conversation
    || m.message.extendedTextMessage?.text
    || "";
  if (!text.trim()) return;
  await onIncomingMessage(m.key.remoteJid, text);
});

console.log("Bot berjalan. Ketik perintah dari WA: stok, cari, order, tambahpelanggan, kiriminvoice, kirimsemua, bantuan");
