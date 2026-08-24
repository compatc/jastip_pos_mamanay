const fs = require('fs');
const path = '/opt/wa-bot/index.js';
let code = fs.readFileSync(path, 'utf8');

const old = `function handleBadMac(context) {
  badMacCount++;
  console.log(\`[Bad MAC] \${context} — count: \${badMacCount}/\${BAD_MAC_THRESHOLD}\`);
  if (badMacCount >= BAD_MAC_THRESHOLD) {
    console.log(\`[Bad MAC] Threshold reached (\${badMacCount}). Deleting session & restarting...\`);
    try {
      const sessionDir = './session';
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log('[Bad MAC] Session folder deleted.');
      }
    } catch (e) {
      console.log('[Bad MAC] Failed to delete session:', e.message);
    }
    process.exit(1);
  }
}`;

const replacement = `function handleBadMac(context) {
  badMacCount++;
  console.log(\`[Bad MAC] \${context} — count: \${badMacCount}/\${BAD_MAC_THRESHOLD}\`);
  if (badMacCount >= BAD_MAC_THRESHOLD) {
    console.log(\`[Bad MAC] Threshold reached (\${badMacCount}). Auto-restarting via PM2...\`);
    process.exit(1);
  }
}`;

if (code.includes(old)) {
  code = code.replace(old, replacement);
  fs.writeFileSync(path, code);
  console.log('OK — reverted: no auto-delete session');
} else {
  console.log('SKIP — already reverted');
}
