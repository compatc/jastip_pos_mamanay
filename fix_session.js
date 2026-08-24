const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Replace the connection.update close handler to properly close old socket + add delay
const oldCloseHandler = `if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('Logged out! Hapus folder session dan restart.');
        process.exit(1);
      } else {
        console.log('Connection closed, reconnecting...');
        startBot();
      }
    }`;

const newCloseHandler = `if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('Logged out! Hapus folder session dan restart.');
        process.exit(1);
      } else {
        console.log('Connection closed (reason: ' + reason + '), reconnecting in 5s...');
        try { if (sock && sock.ws) sock.ws.close(); } catch(_) {}
        sockRef = null;
        setTimeout(() => { startBot(); }, 5000);
      }
    }`;

if (code.includes(oldCloseHandler)) {
  code = code.replace(oldCloseHandler, newCloseHandler);
  console.log('1. Fixed reconnect handler with delay + old socket cleanup');
} else {
  console.log('1. SKIP — reconnect handler not found (may already be patched)');
}

// 2. Add socket guard: don't start new bot if one is already connecting
const startBotMarker = 'async function startBot() {';
const guardCode = `let isStarting = false;
async function startBot() {
  if (isStarting) { console.log('[Bot] Already starting, skipping...'); return; }
  isStarting = true;
  setTimeout(() => { isStarting = false; }, 15000); // reset after 15s`;

if (!code.includes('let isStarting = false;')) {
  code = code.replace(startBotMarker, guardCode);
  console.log('2. Added startBot guard to prevent concurrent starts');
} else {
  console.log('2. SKIP — startBot guard already exists');
}

// 3. Add saveCreds debounce — only save every 2 seconds max
const saveCredsMarker = "sock.ev.on('creds.update', saveCreds);";
const debouncedSave = `let _lastSave = 0;
  sock.ev.on('creds.update', () => {
    const now = Date.now();
    if (now - _lastSave > 2000) { _lastSave = now; saveCreds(); }
  });`;

if (!code.includes('_lastSave')) {
  code = code.replace(saveCredsMarker, debouncedSave);
  console.log('3. Added saveCreds debounce (max once per 2s)');
} else {
  console.log('3. SKIP — saveCreds debounce already exists');
}

fs.writeFileSync(path, code);
console.log('Done!');
