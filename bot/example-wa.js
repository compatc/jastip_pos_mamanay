/**
 * Contoh integrasi dengan bot WhatsApp (Baileys).
 *
 * Cara pakai:
 *   1. npm install @whiskeysockets/baileys
 *   2. isi .env (lihat README.md)
 *   3. node bot/example-wa.js
 *
 * Bagian koneksi WA tinggal disesuaikan dengan library bot kamu
 * (Baileys, Wabot-AI, open-wa, dll) — intinya: ambil pesan masuk,
 * teruskan ke handleBotMessage(), lalu kirim balik hasilnya.
 */
import "dotenv/config";
import { BotApi, handleBotMessage } from "./supabase-bot.js";

const api = new BotApi();
await api.login(
  process.env.BOT_EMAIL,
  process.env.BOT_PASSWORD
);
console.log("Login sukses, bot siap.");

// Contoh pesan masuk dari WA (simulasi). Ganti dengan event dari library bot kamu.
async function onIncomingMessage(remoteJid, text) {
  try {
    const reply = await handleBotMessage(api, remoteJid, text);
    // await sock.sendMessage(remoteJid, { text: reply });
    console.log(`[${remoteJid}] ${text}\n  -> ${reply}`);
  } catch (e) {
    console.log("Error:", e.message);
    // await sock.sendMessage(remoteJid, { text: "Error: " + e.message });
  }
}

// ——— Baileys (contoh) ———
// import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
// const { state, saveCreds } = await useMultiFileAuthState("wa-auth");
// const sock = makeWASocket({ auth: state });
// sock.ev.on("creds.update", saveCreds);
// sock.ev.on("messages.upsert", async ({ messages }) => {
//   const m = messages[0];
//   if (!m?.message?.conversation) return;
//   await onIncomingMessage(m.key.remoteJid, m.message.conversation);
// });

// ——— Simulasi tanpa WA (untuk tes cepat) ———
await onIncomingMessage("test", "bantuan");
await onIncomingMessage("test", "stok skincare");
process.exit(0);
