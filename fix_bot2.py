import re

with open('/opt/wa-bot/index.js', 'r') as f:
    content = f.read()

# Fix parseTagged to handle trailing non-numeric words like "nett", "net", etc.
old_parseTagged = """function parseTagged(text) {
  if (!text) return null;
  const tag = text.match(/\\u{1F3F7}\\uFE0F\\s*(.+)/u);
  if (!tag) return null;
  const line = tag[1].trim();
  const parts = line.split(/\\s+/);
  const priceStr = parts.pop();
  const price = parseInt(priceStr.replace(/[^\\d]/g, ''), 10) || 0;
  const name = parts.join(' ').trim();
  if (!name || price <= 0) return null;
  return { product: name, price };
}"""

new_parseTagged = """function parseTagged(text) {
  if (!text) return null;
  const tag = text.match(/\\u{1F3F7}\\uFE0F\\s*(.+)/u);
  if (!tag) return null;
  const line = tag[1].trim();
  const parts = line.split(/\\s+/);
  // Find the price: last numeric-like token (may have dots/commas)
  let priceIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const cleaned = parts[i].replace(/[^\\d]/g, '');
    if (cleaned.length > 0) {
      priceIdx = i;
      break;
    }
  }
  if (priceIdx < 0) return null;
  const price = parseInt(parts[priceIdx].replace(/[^\\d]/g, ''), 10) || 0;
  const name = parts.slice(0, priceIdx).join(' ').trim();
  if (!name || price <= 0) return null;
  return { product: name, price };
}"""

if old_parseTagged in content:
    content = content.replace(old_parseTagged, new_parseTagged)
    print('parseTagged replaced (exact match)')
else:
    # Try regex replacement
    pattern = r'function parseTagged\(text\) \{.*?return \{ product: name, price \};\n\}'
    replacement = new_parseTagged
    new_content, count = re.subn(pattern, new_parseTagged, content, count=1, flags=re.DOTALL)
    if count > 0:
        content = new_content
        print(f'parseTagged replaced (regex, {count} match)')
    else:
        print('WARNING: Could not find parseTagged function')

with open('/opt/wa-bot/index.js', 'w') as f:
    f.write(content)

print('Done')
