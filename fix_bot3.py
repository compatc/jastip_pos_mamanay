import sys

with open('/opt/wa-bot/index.js', 'r') as f:
    content = f.read()

old = '''function parseTagged(text) {
  if (!text) return null;
  const tag = text.match(/\xf0\x9f\x8f\xb7\xef\xb8\x8f\\s*(.+)/u);
  if (!tag) return null;
  const line = tag[1].trim();
  const parts = line.split(/\\s+/);
  const priceStr = parts.pop();
  const price = parseInt(priceStr.replace(/[^\\d]/g, ''), 10) || 0;
  const name = parts.join(' ').trim();
  if (!name || price <= 0) return null;
  return { product: name, price };
}'''

new = '''function parseTagged(text) {
  if (!text) return null;
  const tag = text.match(/\xf0\x9f\x8f\xb7\xef\xb8\x8f\\s*(.+)/u);
  if (!tag) return null;
  const line = tag[1].trim();
  const parts = line.split(/\\s+/);
  let priceIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/\\d/.test(parts[i])) { priceIdx = i; break; }
  }
  if (priceIdx < 0) return null;
  const price = parseInt(parts[priceIdx].replace(/[^\\d]/g, ''), 10) || 0;
  const name = parts.slice(0, priceIdx).join(' ').trim();
  if (!name || price <= 0) return null;
  return { product: name, price };
}'''

if old in content:
    content = content.replace(old, new)
    with open('/opt/wa-bot/index.js', 'w') as f:
        f.write(content)
    print('OK (exact)')
else:
    print('NOT_FOUND')
