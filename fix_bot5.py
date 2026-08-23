with open('/opt/wa-bot/index.js', 'r') as f:
    lines = f.readlines()

# Find parseTagged function
start = None
end = None
for i, line in enumerate(lines):
    if 'function parseTagged(text)' in line:
        start = i
    if start is not None and i > start and line.strip() == '}' and lines[i-1].strip().startswith('return'):
        end = i
        break

if start is None or end is None:
    print(f'NOT FOUND: start={start} end={end}')
    exit(1)

# Read original function to get the emoji line
orig = ''.join(lines[start:end+1])

# Build new function preserving original emoji
emoji_line = ''
for l in lines[start:end+1]:
    if 'text.match' in l:
        emoji_line = l.strip()
        break

new_func = 'function parseTagged(text) {\n'
new_func += '  if (!text) return null;\n'
new_func += '  const tag = ' + emoji_line.replace('const tag = ', '') + '\n'
new_func += '  if (!tag) return null;\n'
new_func += '  const line = tag[1].trim();\n'
new_func += '  const parts = line.split(/\\s+/);\n'
new_func += '  let priceIdx = -1;\n'
new_func += '  for (let i = parts.length - 1; i >= 0; i--) {\n'
new_func += '    if (/\\d/.test(parts[i])) { priceIdx = i; break; }\n'
new_func += '  }\n'
new_func += '  if (priceIdx < 0) return null;\n'
new_func += '  const price = parseInt(parts[priceIdx].replace(/[^\\d]/g, ""), 10) || 0;\n'
new_func += '  const name = parts.slice(0, priceIdx).join(" ").trim();\n'
new_func += '  if (!name || price <= 0) return null;\n'
new_func += '  return { product: name, price };\n'
new_func += '}\n'

lines[start:end+1] = [new_func]

with open('/opt/wa-bot/index.js', 'w') as f:
    f.writelines(lines)

print(f'OK replaced lines {start+1}-{end+1}')
