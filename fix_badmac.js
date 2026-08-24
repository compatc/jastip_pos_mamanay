const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Add badMacCount after msgRetryCounterCache
const marker = 'const msgRetryCounterCache = new NodeCache();';
if (!code.includes('let badMacCount = 0;')) {
  code = code.replace(marker, marker + '\nlet badMacCount = 0;\nconst BAD_MAC_THRESHOLD = 5;\n\nfunction handleBadMac(context) {\n  badMacCount++;\n  console.log(`[Bad MAC] ${context} — count: ${badMacCount}/${BAD_MAC_THRESHOLD}`);\n  if (badMacCount >= BAD_MAC_THRESHOLD) {\n    console.log(`[Bad MAC] Threshold reached (${badMacCount}). Auto-restarting via PM2...`);\n    process.exit(1);\n  }\n}\n\nfunction resetBadMacCount() {\n  if (badMacCount > 0) {\n    console.log(`[Bad MAC] Reset count (${badMacCount} → 0) after successful connection`);\n    badMacCount = 0;\n  }\n}');
}

// 2. Replace Bad MAC handlers in send-batch and send-invoice
code = code.replace(
  /if \(e\.message && e\.message\.includes\('Bad MAC'\)\) \{\s*await new Promise\(r => setTimeout\(r, 10000\)\);\s*\}/g,
  "if (e.message && e.message.includes('Bad MAC')) { handleBadMac('send-invoice'); await new Promise(r => setTimeout(r, 5000)); }"
);

code = code.replace(
  /if \(e\.message && e\.message\.includes\('Bad MAC'\)\) \{\s*console\.log\('Session error detected, waiting 10s\.\.\.'\);\s*await new Promise\(r => setTimeout\(r, 10000\)\);\s*\}/g,
  "if (e.message && e.message.includes('Bad MAC')) { handleBadMac('send-invoice-batch'); console.log('Session error, waiting 5s...'); await new Promise(r => setTimeout(r, 5000)); }"
);

// 3. Add resetBadMacCount on successful connection
code = code.replace(
  /if \(connection === 'open'\) \{\s*console\.log\('Bot WA siap!'\);/,
  "if (connection === 'open') {\n      resetBadMacCount();\n      console.log('Bot WA siap!');"
);

fs.writeFileSync(path, code);
console.log('Done! Changes applied.');
