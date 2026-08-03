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
    await sock.sendMessage(remoteJid, { text: reply });
  } catch (e) {
    await sock.sendMessage(remoteJid, { text: "Error: " + e.message });
  }
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

console.log("Bot berjalan. Ketik perintah dari WA: stok, cari, order, tambahpelanggan, bantuan");
