const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const NodeCache = require('node-cache');
require('dotenv').config();
const { pushOrderToSupabase, getApi } = require('./supabase.js');

function parseMultipart(buffer, boundary) {
  const parts = {};
  const boundaryBuf = Buffer.from('--' + boundary);
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    start += boundaryBuf.length + 2;
    let end = buffer.indexOf(boundaryBuf, start);
    if (end === -1) break;
    const part = buffer.slice(start, end - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) { start = end; continue; }
    const headers = part.slice(0, headerEnd).toString();
    const body = part.slice(headerEnd + 4);
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    if (nameMatch) {
      if (filenameMatch) {
        parts[nameMatch[1]] = { data: body, filename: filenameMatch[1] };
      } else {
        parts[nameMatch[1]] = body.toString().trim();
      }
    }
    start = end;
  }
  return parts;
}


const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const GROUP_ID = process.env.GROUP_ID || null;
const LOG_FILE = './orders.json';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '';
const WEB_API_URL = process.env.WEB_API_URL || '';
const WEB_API_TOKEN = process.env.WEB_API_TOKEN || '';
const API_PORT = process.env.API_PORT || 3001;
const API_TOKEN = process.env.API_TOKEN || '';
const USE_NGROK = process.env.USE_NGROK === 'true';
const SESSION_DIR = './session';

const ADMIN_NUMBER_DIGITS = (process.env.ADMIN_NUMBER || '').replace(/\D/g, '');
const NOTIF_NUMBER = process.env.NOTIF_NUMBER || '';
const NOTIF_NUMBER_DIGITS = NOTIF_NUMBER.replace(/\D/g, '');
const msgRetryCounterCache = new NodeCache();

const LID_MAP_FILE = './lid-map.json';
let lidMap = {};

function loadLidMap() {
  try {
    lidMap = JSON.parse(fs.readFileSync(LID_MAP_FILE, 'utf8'));
  } catch { lidMap = {}; }
}

function saveLidMap() {
  fs.writeFileSync(LID_MAP_FILE, JSON.stringify(lidMap, null, 2));
}

function resolveSenderNumber(sock, participant) {
  const user = participant.split('@')[0].replace(/\D/g, '');
  const server = participant.split('@')[1];

  // Kalau sudah phone JID langsung pakai
  if (server === 's.whatsapp.net') return user;

  // Coba dari lidMap (LID ΓåÆ phone)
  if (lidMap[participant]) return lidMap[participant];

  // Coba dari group metadata participants
  if (sock._groupParticipants) {
    for (const p of sock._groupParticipants) {
      if (p.id === participant && p.jid) {
        const phone = p.jid.split('@')[0].replace(/\D/g, '');
        lidMap[participant] = phone;
        saveLidMap();
        return phone;
      }
    }
  }

  return user;
}

// --- Current Promo Persistence ---
const CURRENT_PROMO_FILE = '/opt/wa-bot/current-promo.json';
function loadCurrentPromo() {
  try {
    if (existsSync(CURRENT_PROMO_FILE)) {
      return JSON.parse(readFileSync(CURRENT_PROMO_FILE, 'utf8'));
    }
  } catch (_) {}
  return { product: '', price: '', sender: '', waktu: '', msgId: '' };
}
function saveCurrentPromo() {
  try {
    fs.writeFileSync(CURRENT_PROMO_FILE, JSON.stringify(currentPromo, null, 2));
  } catch (e) { console.error('Gagal save currentPromo:', e.message); }
}

let currentPromo = loadCurrentPromo();

// --- Promo Stocks Persistence ---
const PROMO_STOCKS_FILE = '/opt/wa-bot/promo-stocks.json';
function loadPromoStocks() {
  try {
    if (existsSync(PROMO_STOCKS_FILE)) {
      return JSON.parse(readFileSync(PROMO_STOCKS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}
function savePromoStocks() {
  try {
    fs.writeFileSync(PROMO_STOCKS_FILE, JSON.stringify(promoStocks, null, 2));
  } catch (e) { console.error('Gagal save promoStocks:', e.message); }
}

async function fetchStockFromDb(productName) {
  try {
    const catalogUrl = process.env.WEB_API_URL || 'https://mamanay.vercel.app';
    const res = await fetch(catalogUrl + '/api/catalog-order');
    const json = await res.json();
    const products = json.data || json.products || [];
    const cleanName = productName.replace(/\[.*?\]|\b(ready|readyh|po)\b/gi, '').replace(/\s+/g, ' ').trim();
    let match = products.find(p => p.name === productName);
    if (!match) match = products.find(p => p.name.toLowerCase().includes(cleanName.toLowerCase()));
    if (!match) return null;
    if (match.stock_type === 'po') return null;
    return match.stock || 0;
  } catch (e) {
    console.error('fetchStockFromDb error:', e.message);
    return null;
  }
}

async function rebuildPromoStocksFromDb() {
  try {
    const catalogUrl = process.env.WEB_API_URL || 'https://mamanay.vercel.app';
    const res = await fetch(catalogUrl + '/api/catalog-order');
    const json = await res.json();
    const products = json.data || json.products || [];

    const newPromoStocks = {};
    for (const p of products) {
      if (p.stock_type === 'po') continue;
      const variants = p.variants || [];
      if (variants.length > 0) {
        let total = 0;
        for (const v of variants) {
          if (p.stock_type !== 'po' && (v.stock || 0) > 0) total += v.stock;
        }
        if (total > 0) newPromoStocks[p.name] = total;
      } else {
        if ((p.stock || 0) > 0) newPromoStocks[p.name] = p.stock;
      }
    }

    Object.assign(promoStocks, newPromoStocks);
    savePromoStocks();
    console.log('rebuildPromoStocksFromDb: synced', Object.keys(newPromoStocks).length, 'products');
    return newPromoStocks;
  } catch (e) {
    console.error('rebuildPromoStocksFromDb error:', e.message);
    return null;
  }
}
let promoStocks = loadPromoStocks();
let orders = loadOrders();
loadLidMap();
const seenIds = new Set();
const msgRetryCache = new NodeCache();
let apiServer = null;
let sockRef = null;

function loadOrders() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveOrders() {
  fs.writeFileSync(LOG_FILE, JSON.stringify(orders, null, 2));
}

async function sendToWebhook(data) {
  try {
    const res = await axios.get(N8N_WEBHOOK_URL, { maxRedirects: 0, validateStatus: () => true, timeout: 8000 });
    let target = N8N_WEBHOOK_URL;
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      target = new URL(res.headers.location, N8N_WEBHOOK_URL).href;
    }
    const post = await axios.post(target, data, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
    console.log('Webhook ok:', post.data ? JSON.stringify(post.data) : 'no-response');
  } catch (e) {
    console.log('Webhook fail:', e.message);
  }
}

function markSeen(msg) {
  const key = msg.key;
  const id = key.id;
  if (!id) return false;
  if (seenIds.has(id)) return false;
  seenIds.add(id);
  if (seenIds.size > 5000) {
    const arr = [...seenIds];
    arr.splice(0, 2500);
    seenIds.clear();
    arr.forEach((k) => seenIds.add(k));
  }
  return true;
}

async function kirim(sock, chatId, text) {
  try {
    return await sock.sendMessage(chatId, { text });
  } catch (e) {
    console.log('Kirim gagal:', e.message);
  }
}

async function notifyAdmin(sock, msg) {
  try {
    if (!NOTIF_NUMBER) return;
    const jid = NOTIF_NUMBER_DIGITS + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: '≡ƒñû *BOT ERROR*\n' + msg });
  } catch (e) {}
}

async function sendToWebApi(data) {
  if (!WEB_API_URL) return;
  try {
    const post = await axios.post(WEB_API_URL, data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + WEB_API_TOKEN,
      },
      timeout: 8000,
    });
    console.log('Web API ok:', post.status, post.data ? JSON.stringify(post.data) : 'no-response');
  } catch (e) {
    if (e.response) {
      console.log('Web API fail:', e.response.status, JSON.stringify(e.response.data));
    } else {
      console.log('Web API fail:', e.message);
    }
  }
}

function formatRupiah(n) {
  return 'Rp' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parsePrice(text) {
  const m = text.match(/rp\s?([\d.]+)/i);
  if (m) return parseInt(m[1].replace(/\./g, ''), 10) || 0;
  const m2 = text.match(/(\d+)\s?rb/i);
  if (m2) return parseInt(m2[1], 10) * 1000;
  const per = text.match(/(\d{1,3}(?:\.\d{3})+)\s*\/\s*(\d+)\s*(set|pcs)/i);
  if (per) {
    const total = parseInt(per[1].replace(/\./g, ''), 10);
    const n = parseInt(per[2], 10);
    return per[3].toLowerCase() === 'set' ? total : Math.round(total / n);
  }
  const bare = [...text.matchAll(/(\d{1,3}(?:\.\d{3})+)/g)];
  if (bare.length) return parseInt(bare[bare.length - 1][1].replace(/\./g, ''), 10) || 0;
  return 0;
}

function parseUnit(text) {
  const per = text.match(/\/\s*\d+\s*(set|pcs)/i);
  if (per) return per[1].toLowerCase();
  if (/\bset\b/i.test(text)) return 'set';
  return 'pcs';
}

function parsePcsPerSet(text) {
  const m = text.match(/\/\s*\d+\s*set\b[\s\S]*?(\d+)\s*pcs/i);
  if (m) return parseInt(m[1], 10) || 0;
  return 0;
}

function parseQty(text) {
  const m = text.match(/mau\s*(\d+)/i) || text.match(/tambah\s*(\d+)/i) || text.match(/\b(\d+)\s*(pcs|buah|kak|bang|dong|ya)?\b/i);
  if (m) return parseInt(m[1], 10) || 1;
  return 1;
}

function hasOrderIntent(text) {
  const t = (text || '').toLowerCase();
  const penolakan = /(tidak|nggak|ngga|gak|ga|kaga|kagak)\s*(mau|jadi|usah|beli|pesan|ambil)|gamau|gakmau|nggakmau|nggamau|tidakmau|kagakmau/.test(t);
  if (penolakan) return false;
  const adaAngka = /\d/.test(t);
  const niat = /\b(mau+|beli|ambil|pesan|order|tambah|minat|ingin)\b/.test(t);
  if (adaAngka) return true;
  return niat;
}

const VARIANT_STOP = /^(kak|ka|kaa|kk|kakak|bang|mbak|mbk|mimin|sis|sist|dong|ya|yah|yh|deh|pls|pcs|buah|set|mau+|beli|ambil|pesan|order|tambah|minat|ingin|pingin|pengen|saya|aku|min|bro|admin|sama|lagi|boleh|bisa|neng|teteh)$/i;

function parseVariant(text) {
  const t = (text || '').toLowerCase();
  const m = t.match(/([a-z]+(?:\s+[a-z]+)*)?\s*(\d+)\s*([a-z]+(?:\s+[a-z]+)*)?/i);
  if (!m) return '';
  const sebelum = (m[1] || '').split(/\s+/);
  const sesudah = (m[3] || '').split(/\s+/);
  const words = [...sebelum, ...sesudah].filter((w) => w && !VARIANT_STOP.test(w) && !/^\d+$/.test(w));
  return words.join(' ').trim();
}

function parsePromo(text) {
  const firstLine = text.split('\n')[0].trim();
  return { product: firstLine, price: parsePrice(text) };
}

function parsePromoStructured(text) {
  if (!text) return null;
  const star = text.match(/Γ¡É\s*([^Γ¡É]+?)\s*Γ¡É/);
  const money = text.match(/≡ƒÆ░\s*([\d.,\s]+?)\s*≡ƒÆ░/);
  if (!star || !money) return null;
  const name = star[1].replace(/\s+/g, ' ').trim();
  const price = parseInt(String(money[1]).replace(/[^\d]/g, ''), 10) || 0;
  if (!name || price <= 0) return null;
  const stockMatch = text.match(/\[stok:(\d+)\]/i);
  const stock = stockMatch ? parseInt(stockMatch[1], 10) : null;
  return { product: name, price, stock };
}

function parseTagged(text) {
  if (!text) return null;
  const tag = text.match(/≡ƒÅ╖∩╕Å\s*(.+)/u);
  if (!tag) return null;
  const line = tag[1].trim();
  const parts = line.split(/\s+/);
  let priceIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/\d/.test(parts[i])) { priceIdx = i; break; }
  }
  if (priceIdx < 0) return null;
  const price = parseInt(parts[priceIdx].replace(/[^\d]/g, ""), 10) || 0;
  const name = parts.slice(0, priceIdx).join(" ").trim();
  if (!name || price <= 0) return null;
  const stockMatch = text.match(/\[stok:(\d+)\]/i);
  const stock = stockMatch ? parseInt(stockMatch[1], 10) : null;
  return { product: name, price, stock };
}

function getOrderKey(o) {
  return (o.number || o.sender) + '|' + (o.product || '') + '|' + (o.variant || '');
}

function extractMessageText(msg) {
  const m = msg.message;
  if (!m) return '';
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || '';
}

function extractContextInfo(msg) {
  const m = msg.message;
  if (!m) return null;
  return m.extendedTextMessage?.contextInfo
    || m.imageMessage?.contextInfo
    || m.videoMessage?.contextInfo
    || m.documentMessage?.contextInfo
    || null;
}

function extractQuotedText(ctx) {
  if (!ctx?.quotedMessage) return '';
  const qm = ctx.quotedMessage;
  return qm.conversation
    || qm.extendedTextMessage?.text
    || qm.imageMessage?.caption
    || qm.videoMessage?.caption
    || qm.documentMessage?.caption
    || '';
}

function buatRekapProduk(nama, judul) {
  const list = orders.filter((o) => {
    const onama = ((o.product || o.productDesc || '').split('\n')[0].trim()) || '(tanpa produk)';
    return onama === nama;
  });

  if (list.length === 0) {
    return `≡ƒôï *REKAP ORDER*\n${judul || ''}\nBelum ada order untuk *${nama}*.`;
  }

  const full = list[0].productDesc || list[0].product || nama;
  const unit = parseUnit(full);
  const per = full.match(/(\d{1,3}(?:\.\d{3})+)\s*\/\s*(\d+)\s*(set|pcs)/i);

  let out = `≡ƒôï *REKAP ORDER*\n${judul || ''}\n`;
  out += `list po *${nama}*`;
  if (per) {
    const hargaNominal = parseInt(per[1].replace(/\./g, ''), 10);
    out += ` harga ${formatRupiah(hargaNominal)}/ ${per[2]} ${per[3].toLowerCase()}`;
  } else if (parsePrice(full)) {
    out += ` harga ${formatRupiah(parsePrice(full))}/ 1 ${unit}`;
  }
  out += `\n`;

  if (unit === 'set') {
    const pcsSet = parsePcsPerSet(full);
    if (pcsSet) out += `1 set: ${pcsSet}pcs\n`;
  }

  const groups = new Map();
  for (const x of list) {
    const v = ((x.variant || '').trim() || 'tanpa varian').toUpperCase();
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(x);
  }

  let totalAll = 0;
  for (const [v, items] of groups) {
    out += `\n*${v}*\n`;
    items.forEach((x, i) => {
      const last4 = String(x.number || '').slice(-4);
      const nomor = last4 ? ` -- ${last4}` : '';
      out += `${i + 1}. ${x.sender}${nomor} -- ${x.qty}\n`;
    });
    const sub = items.reduce((s, x) => s + x.qty, 0);
    totalAll += sub;
    out += `subtotal: ${sub}\n`;
  }

  out += `\ntotal: ${totalAll} ${unit}\n`;
  return out;
}

async function handleCommand(sock, chatId, text) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_EMAIL) return false;
  if (chatId && String(chatId).endsWith('@g.us')) return false;
  const firstWord = text.split(/\s+/)[0].toLowerCase().replace(/[.\/!]/g, '');
  const COMMAND_WORDS = ['stok', 'cari', 'order', 'cekorder', 'tambahpelanggan', 'kiriminvoice', 'kirimsemua', 'bantuan', 'help'];
  if (!COMMAND_WORDS.includes(firstWord)) return false;
  try {
    console.log('PERINTAH:', text);
    const api = await getApi();
    const { handleBotMessage } = await import('./bot-api.mjs');
    const reply = await handleBotMessage(api, '', text);

    // Handle JSON actions (invoice sending)
    if (reply.startsWith('{')) {
      const action = JSON.parse(reply);

      if (action.action === 'send_invoice') {
        try {
          if (action.phone) {
            const jid = normalizeWaJid(action.phone);
            if (jid) {
              await sock.sendMessage(jid, { text: action.msg });
              await kirim(sock, chatId, `Γ£à Invoice dikirim ke ${action.customerName}`);
            } else {
              await kirim(sock, chatId, `Γ¥î Nomor WA tidak valid untuk ${action.customerName}`);
            }
          } else {
            await kirim(sock, chatId, `ΓÜá∩╕Å ${action.customerName} tidak punya nomor WA.`);
          }
        } catch (e) {
          console.error('Send invoice error:', e.message);
          await kirim(sock, chatId, `Γ¥î Gagal kirim invoice ke ${action.customerName}: ${e.message}`);
        }
        return true;
      }

      if (action.action === 'send_batch') {
        let sent = 0;
        let failed = 0;
        const failedNames = [];
        for (const inv of action.invoices) {
          try {
            if (inv.phone) {
              const jid = normalizeWaJid(inv.phone);
              if (jid) {
                await sock.sendMessage(jid, { text: inv.msg });
                sent++;
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
              } else {
                failed++;
                failedNames.push(inv.name);
              }
            } else {
              failed++;
              failedNames.push(inv.name);
            }
          } catch (e) {
            console.error('Send batch error:', e.message);
            failed++;
            failedNames.push(inv.name);
            if (e.message && e.message.includes('Bad MAC')) {
              await new Promise(r => setTimeout(r, 10000));
            }
          }
        }
        let summary = `Γ£à Invoice terkirim: ${sent}/${action.count}`;
        if (failed > 0) summary += `\nΓ¥î Gagal: ${failed} (${failedNames.join(', ')})`;
        await kirim(sock, chatId, summary);
        return true;
      }
    }

    await kirim(sock, chatId, reply);
  } catch (e) {
    await kirim(sock, chatId, 'Error: ' + e.message);
  }
  return true;
}

async function handleMessage(sock, messageUpdate) {
  const msg = messageUpdate.messages?.[0];
  if (!msg || (msg.key.fromMe && messageUpdate.type !== 'notify')) return;

  try {
    const chatId = msg.key.remoteJid;
    const isGroup = chatId?.endsWith('@g.us');
    const isPrivate = !isGroup;

    if (isPrivate) {
      const text = extractMessageText(msg);
      if (await handleCommand(sock, chatId, text)) return;
    }

    if (!isGroup) return;
    if (GROUP_ID && chatId !== GROUP_ID) return;

    if (!markSeen(msg)) return;

    const isMine = !!msg.key.fromMe;
    const senderName = msg.pushName || 'Unknown';

    // Ambil nomor HP dari participant
    const participant = msg.key.participant || msg.key.remoteJid || '';
    let senderNumber = resolveSenderNumber(sock, participant);

    const text = extractMessageText(msg);
    console.log('PESAN:', chatId, '| dariMe:', isMine, '| isi:', text.slice(0, 80));

    if (isMine) {
      const parsed = parsePromoStructured(text);
      const tagged = parseTagged(text);
      if (parsed) {
        currentPromo = { ...parsed, sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };
        saveCurrentPromo();
        if (parsed.stock !== null && parsed.stock !== undefined) {
          promoStocks[parsed.product] = parsed.stock;
          console.log('STOCK SET:', parsed.product, '=', parsed.stock);
          savePromoStocks();
        }
        console.log('PROMO DETECTED (valid):', JSON.stringify(parsed));
      } else if (tagged) {
        currentPromo = { ...tagged, sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };
        saveCurrentPromo();
        if (tagged.stock !== null && tagged.stock !== undefined) {
          promoStocks[tagged.product] = tagged.stock;
          console.log('STOCK SET:', tagged.product, '=', tagged.stock);
          savePromoStocks();
        }
        console.log('PROMO DETECTED (tagged):', JSON.stringify(tagged));
      } else if (text && !/^[.\/!]/.test(text) && !text.includes('REKAP ORDER')) {
        currentPromo = { ...parsePromo(text), sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };
        saveCurrentPromo();
        console.log('PROMO DETECTED tapi tidak sesuai pola:', text.slice(0, 100));
      }
      return;
    }

    if (/\b(cancel|batal|batalkan|hapus)\b/.test(text.toLowerCase())) {
      const affected = orders
        .filter((o) => o.number === senderNumber || o.sender === senderName)
        .map((o) => ((o.product || o.productDesc || '').split('\n')[0].trim() || '(tanpa produk)'));
      const before = orders.length;
      orders = orders.filter((o) => !(o.number === senderNumber || o.sender === senderName));
      if (orders.length !== before) {
        saveOrders();
        console.log('CANCEL by:', senderName);
        for (const p of [...new Set(affected)]) {
          await kirim(sock, chatId, buatRekapProduk(p, 'Setelah dibatalkan:'));
        }
      }
      return;
    }

    let promo = null;
    const ctx = extractContextInfo(msg);
    if (ctx) {
      const qBody = extractQuotedText(ctx);
      const parsed = parsePromoStructured(qBody) || parseTagged(qBody);
      if (!parsed) {
        console.log('QUOTED TIDAK COCOK POLA:', qBody.slice(0, 100));
      } else {
        const quotedParticipant = ctx.participant || '';
        const quotedJid = quotedParticipant.split('@')[0].replace(/\D/g, '');

        // Cek apakah dari admin:
        // 1. Cek via key (pesan yang diquote = pesan bot sendiri)
        // 2. Cek via LID (participant berformat @lid = akun yang sama dengan bot)
        // 3. Cek via nomor admin
        const botLidUser = (sock.user?.lid || '').split('@')[0].replace(/\D/g, '');
        const isLidMatch = botLidUser && quotedJid === botLidUser;
        const isFromMe = msg.key.fromMe;
        const isAdminNumber = ADMIN_NUMBER_DIGITS && quotedJid === ADMIN_NUMBER_DIGITS;

        // isLidFormat: hanya jika @lid yang match dengan bot's own LID
        const isLidFormat = quotedParticipant.endsWith('@lid') && botLidUser && quotedJid === botLidUser;
        const isPromoSenderLid = currentPromo.senderLid && quotedParticipant === currentPromo.senderLid;

        // Resolve LID to phone number via lidMap, then check admin number
        let resolvedAdminPhone = false;
        if (quotedParticipant.endsWith('@lid') && lidMap[quotedParticipant]) {
          const resolvedPhone = lidMap[quotedParticipant].replace(/\D/g, '');
          resolvedAdminPhone = ADMIN_NUMBER_DIGITS && resolvedPhone === ADMIN_NUMBER_DIGITS;
        }

        const isAdminQuote = isFromMe || isLidMatch || isAdminNumber || isLidFormat || isPromoSenderLid || resolvedAdminPhone;

        console.log('QUOTED check:', { isFromMe, isLidMatch, isAdminNumber, isLidFormat, isPromoSenderLid, resolvedAdminPhone, quotedParticipant, botLidUser: botLidUser || '(kosong)', resolvedPhone: lidMap[quotedParticipant] || '(none)' });

        if (isAdminQuote) {
          promo = {
            product: parsed.product,
            price: parsed.price,
            promoMsgId: ctx.stanzaId || '',
          };
          console.log('QUOTED PROMO VALID dari admin:', JSON.stringify(promo));
        } else {
          console.log('QUOTED BUKAN DARI ADMIN:', quotedParticipant);
        }
      }
    } else {
      console.log('BUKAN REPLY / TIDAK ADA QUOTED:', text.slice(0, 60));
    }

    if (!promo) return;

    if (!hasOrderIntent(text)) {
      console.log('BUKAN NIAT BELI:', text.slice(0, 60));
      return;
    }

    const qty = parseQty(text);
    const unitPrice = promo.price;
    const total = unitPrice * qty;
    const namaProduk = promo.product;
    const varian = parseVariant(text);

    const orderData = {
      tanggal: new Date().toLocaleDateString('id-ID'),
      jam: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      sender: senderName,
      number: senderNumber,
      product: namaProduk,
      variant: varian,
      productDesc: `Γ¡É${namaProduk}Γ¡É\n≡ƒÆ░${unitPrice.toLocaleString('id-ID')}≡ƒÆ░`,
      promoMsgId: promo.promoMsgId,
      qty: qty,
      hargaSatuan: unitPrice,
      total: total,
      message: text,
      group: chatId,
      timestamp: new Date().toISOString()
    };

    const isTambah = text.toLowerCase().includes('tambah');

    // Cek stok sebelum simpan order (with DB fallback)
    let currentStock = promoStocks[namaProduk];
    if (currentStock === null || currentStock === undefined) {
      console.log('STOK NOT IN PROMO, fetching from DB:', namaProduk);
      const dbStock = await fetchStockFromDb(namaProduk);
      if (dbStock !== null) {
        currentStock = dbStock;
        promoStocks[namaProduk] = dbStock;
        savePromoStocks();
        console.log('STOK FROM DB:', namaProduk, '=', dbStock);
      }
    }
    if (currentStock !== null && currentStock !== undefined) {
      const existingOrder = orders.find((o) => getOrderKey(o) === getOrderKey(orderData));
      const alreadyOrdered = existingOrder ? existingOrder.qty : 0;
      const available = currentStock - alreadyOrdered;
      if (available <= 0) {
        console.log('STOK HABIS:', namaProduk);
        await kirim(sock, chatId, ' Mohon maaf, stok *' + namaProduk + '* sudah habis.');
        return;
      }
      if (qty > available) {
        console.log('STOK KURANG:', namaProduk, 'sisa', available);
        await kirim(sock, chatId, ' Stok *' + namaProduk + '* tinggal ' + available + ' pcs. Apakah mau ' + available + ' pcs?');
        return;
      }
    }
    const existingIdx = orders.findIndex((o) => getOrderKey(o) === getOrderKey(orderData));
    if (existingIdx >= 0) {
      const existing = orders[existingIdx];
      const newQty = existing.qty + orderData.qty;
      orders[existingIdx] = { ...existing, qty: newQty, total: newQty * (existing.hargaSatuan || 0), jam: orderData.jam, timestamp: orderData.timestamp };
    } else {
      orders.push(orderData);
    }

    // Kurangi stok
    if (promoStocks[namaProduk] !== null && promoStocks[namaProduk] !== undefined) {
      promoStocks[namaProduk] -= qty;
      console.log('STOCK DEDUCTED:', namaProduk, '=', promoStocks[namaProduk]);
      savePromoStocks();
    }

    saveOrders();

    console.log('ORDER SAVED:', JSON.stringify(orderData, null, 2));

    if (N8N_WEBHOOK_URL) sendToWebhook(orderData);
    sendToWebApi(orderData);
    pushOrderToSupabase(orderData);

    const rekap = buatRekapProduk(namaProduk, isTambah ? 'Order ditambahkan:' : 'Order baru:');
    await kirim(sock, chatId, rekap);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    notifyAdmin(sock, 'ErrorσñäτÉå pesan: ' + err.message);
  }
}

function normalizeWaJid(phone) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  if (!digits.startsWith('62')) digits = '62' + digits;
  return digits + '@s.whatsapp.net';
}

function startApiServer() {
  try {
  console.log('Starting API server on port', API_PORT);
  // Close existing server if any
  if (apiServer) {
    try { apiServer.close(); } catch {}
    apiServer = null;
  }
  
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // GET /api/health ΓÇö no auth required
    if (req.method === 'GET' && req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, bot: sockRef ? 'connected' : 'waiting' }));
      return;
    }

    // GET /api/rebuild-stocks - rebuild promoStocks from DB
    if (req.method === 'GET' && req.url === '/api/rebuild-stocks') {
      try {
        const newStocks = await rebuildPromoStocksFromDb();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, products: Object.keys(newStocks || {}).length, stocks: newStocks }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Auth check
    if (API_TOKEN) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${API_TOKEN}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    let body = '';
    const isMultipartSendGroup = (req.url === '/api/send-group' && (req.headers['content-type'] || '').includes('multipart/form-data'));
    
    if (isMultipartSendGroup) {
      // Handle multipart separately - collect raw buffer
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const rawBody = Buffer.concat(chunks);
          const ct = req.headers['content-type'] || '';
          const bMatch = ct.match(/boundary=(.+)/);
          if (!bMatch) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'bad multipart'})); return; }
          const parts = parseMultipart(rawBody, bMatch[1].trim());
          const group_jid = parts.group_jid;
          const message = parts.message;
          const imageBuf = parts.image && parts.image.data ? parts.image.data : null;
          
          console.log('[send-group] group:', group_jid, 'image:', imageBuf ? (imageBuf.length + ' bytes') : 'none');
          if (!group_jid || !message) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'group_jid and message required'})); return; }
          if (!sockRef) { res.writeHead(503, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'WhatsApp not connected yet'})); return; }
          
          if (imageBuf) {
            try { await sockRef.sendMessage(group_jid, { image: imageBuf, caption: message }); console.log('[send-group] image sent OK'); }
            catch (e) { console.error('[send-group] image FAILED:', e.message); await sockRef.sendMessage(group_jid, { text: message }); }
          } else {
            await sockRef.sendMessage(group_jid, { text: message });
          }
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true, sentTo:group_jid}));
        } catch(e) { console.error('send-group multipart error:', e.message); res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message})); }
      });
      return; // skip normal parsing
    }
    
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        // POST /api/send-invoice
        if (req.url === '/api/send-invoice') {
          const { phone, message } = data;
          if (!phone || !message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'phone and message required' }));
            return;
          }
          if (!sockRef) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'WhatsApp not connected yet' }));
            return;
          }
          const jid = normalizeWaJid(phone);
          if (!jid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid phone number' }));
            return;
          }
          await sockRef.sendMessage(jid, { text: message });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, sentTo: jid }));
          return;
        }

        // POST /api/send-group (JSON path - multipart handled above)
        if (req.url === '/api/send-group') {
          const group_jid = data.group_jid;
          const message = data.message;
          let imageBuf = null;
          if (data.image_url) {
            if (data.image_url.startsWith('data:')) {
              imageBuf = Buffer.from(data.image_url.split(',')[1], 'base64');
            } else {
              const r = await fetch(data.image_url);
              imageBuf = Buffer.from(await r.arrayBuffer());
            }
          }
          console.log('[send-group] group:', group_jid, 'image:', imageBuf ? (imageBuf.length + ' bytes') : 'none');
          if (!group_jid || !message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'group_jid and message required' }));
            return;
          }
          if (!sockRef) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'WhatsApp not connected yet' }));
            return;
          }
          if (imageBuf) {
            try {
              await sockRef.sendMessage(group_jid, { image: imageBuf, caption: message });
              console.log('[send-group] image sent OK');
            } catch (e) {
              console.error('[send-group] image FAILED:', e.message);
              await sockRef.sendMessage(group_jid, { text: message });
            }
          } else {
            await sockRef.sendMessage(group_jid, { text: message });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, sentTo: group_jid }));
          return;
        }

        // POST /api/send-batch
        if (req.url === '/api/send-batch') {
          const { invoices } = data; // [{ phone, message }, ...]
          if (!Array.isArray(invoices) || invoices.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invoices array required' }));
            return;
          }
          if (!sockRef) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'WhatsApp not connected yet' }));
            return;
          }
          let sent = 0;
          let failed = 0;
          for (const inv of invoices) {
            try {
              const jid = normalizeWaJid(inv.phone);
              if (jid && inv.message) {
                await sockRef.sendMessage(jid, { text: inv.message });
                sent++;
                // Delay 3-5 detik antar pesan untuk hindari session corrupt
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
              } else {
                failed++;
              }
            } catch (e) {
              console.error('Send invoice error:', e.message);
              failed++;
              // Kalau session error, tunggu lebih lama
              if (e.message && e.message.includes('Bad MAC')) {
                console.log('Session error detected, waiting 10s...');
                await new Promise(r => setTimeout(r, 10000));
              }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, sent, failed }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`Port ${API_PORT} already in use, retrying in 3s...`);
      setTimeout(() => {
        try { server.close(); } catch {}
        server.listen(API_PORT);
      }, 3000);
    } else {
      console.error('API server error:', e.message);
      notifyAdmin(sock, 'API server error: ' + e.message);
    }
  });

  server.listen(API_PORT, async () => {
    apiServer = server;
    console.log(`API server running on port ${API_PORT}`);

    // Start ngrok if enabled
    if (USE_NGROK) {
      try {
        const { execSync } = require('child_process');
        // Kill existing ngrok first
        try { execSync('pkill ngrok'); } catch {}
        await new Promise(r => setTimeout(r, 1000));
        // Start ngrok in background
        const ngrok = require('child_process').spawn('/home/pi/ngrok', ['http', String(API_PORT)], {
          detached: true,
          stdio: 'ignore',
        });
        ngrok.unref();
        // Wait for ngrok to start and get URL
        await new Promise(r => setTimeout(r, 5000));
        const axios = require('axios');
        const ngrokRes = await axios.get('http://127.0.0.1:4040/api/tunnels', { timeout: 5000 });
        const url = ngrokRes.data.tunnels[0]?.public_url;
        if (url) {
          console.log(`Ngrok tunnel: ${url}`);
          // Save URL to Supabase
          try {
            const api = await getApi();
            await api.sb.from('settings').upsert({
              key: 'bot_api_url',
              value: url,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });
            console.log('Bot URL saved to Supabase:', url);
          } catch (e) {
            console.log('Failed to save URL to Supabase:', e.message);
          }
        } else {
          console.log('Ngrok started but no URL found');
        }
      } catch (e) {
        console.log('Ngrok failed:', e.message);
        console.log('Bot API available locally at http://localhost:' + API_PORT);
      }
    } else {
      console.log('Bot API available locally at http://localhost:' + API_PORT);
    }
  });
  } catch (e) { console.error('startApiServer crash:', e.message, e.stack); notifyAdmin(sock, 'Bot crash: ' + e.message); }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    msgRetryCounterCache,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (messageUpdate) => {
    if (messageUpdate.type !== 'notify') return;
    await handleMessage(sock, messageUpdate);
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log('Scan QR di atas dengan WhatsApp kamu');
    }
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('Logged out! Hapus folder session dan restart.');
        process.exit(1);
      } else {
        console.log('Connection closed, reconnecting...');
        startBot();
      }
    }
    if (connection === 'open') {
      console.log('Bot WA siap!');
      sockRef = sock;
      // Fetch group metadata untuk build LID ΓåÆ phone mapping
      if (GROUP_ID) {
        try {
          const meta = await sock.groupMetadata(GROUP_ID);
          sock._groupParticipants = meta.participants;
          console.log('Group participants loaded:', meta.participants.length);
          // Build lidMap dari participants
          for (const p of meta.participants) {
            if (p.id && p.jid && p.id.endsWith('@lid')) {
              const phone = p.jid.split('@')[0].replace(/\D/g, '');
              if (!lidMap[p.id]) {
                lidMap[p.id] = phone;
              }
            }
          }
          saveLidMap();
          console.log('LID map entries:', Object.keys(lidMap).length);
        } catch (e) {
          console.log('Gagal load group metadata:', e.message);
        }
      }
    }
  });
}

startApiServer();
startBot();
