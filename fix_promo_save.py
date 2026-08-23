import re

with open('/opt/wa-bot/index.js', 'r') as f:
    content = f.read()

# 1. Replace the in-memory currentPromo with load/save version
old = "let currentPromo = { product: '', price: '', sender: '', waktu: '', msgId: '' };"
new = """// --- Current Promo Persistence ---
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
    writeFileSync(CURRENT_PROMO_FILE, JSON.stringify(currentPromo, null, 2));
  } catch (e) { console.error('Gagal save currentPromo:', e.message); }
}

let currentPromo = loadCurrentPromo();"""

content = content.replace(old, new)

# 2. Add saveCurrentPromo() after each assignment
patterns = [
    "currentPromo = { ...parsed, sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };",
    "currentPromo = { ...tagged, sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };",
    "currentPromo = { ...parsePromo(text), sender: senderName, senderLid: participant, waktu: new Date().toLocaleString('id-ID'), msgId: msg.key.id };",
]

for p in patterns:
    content = content.replace(p, p + "\n        saveCurrentPromo();")

with open('/opt/wa-bot/index.js', 'w') as f:
    f.write(content)

print("Done")
