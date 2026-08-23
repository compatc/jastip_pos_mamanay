with open('/opt/wa-bot/index.js', 'r') as f:
    lines = f.readlines()

# parseTagged is at lines 219-230 (1-indexed)
# Replace lines 218-230 (0-indexed: 218 to 229 inclusive)
new_func = '''function parseTagged(text) {
  if (!text) return null;
  const tag = text.match(/\u{1F3F7}\uFE0F\s*(.+)/u);
  if (!tag) return null;
  const line = tag[1].trim();
  const parts = line.split(/\\s+/);
  // Find price: scan from right, first token with digits
  let priceIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/\\d/.test(parts[i])) { priceIdx = i; break; }
  }
  if (priceIdx < 0) return null;
  const price = parseInt(parts[priceIdx].replace(/[^\\d]/g, ''), 10) || 0;
  const name = parts.slice(0, priceIdx).join(' ').trim();
  if (!name || price <= 0) return null;
  return { product: name, price };
}
'''

# Find the function
start = None
end = None
for i, line in enumerate(lines):
    if 'function parseTagged(text)' in line:
        start = i
    if start is not None and i > start and line.strip() == '}' and lines[i-1].strip().startswith('return'):
        end = i
        break

if start is not None and end is not None:
    lines[start:end+1] = [new_func]
    with open('/opt/wa-bot/index.js', 'w') as f:
        f.writelines(lines)
    print(f'OK replaced lines {start+1}-{end+1}')
else:
    print(f'NOT FOUND: start={start} end={end}')
