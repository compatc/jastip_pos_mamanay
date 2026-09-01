import sys

code = open('/opt/wa-bot/index.js', 'r', encoding='utf-8').read()

# Fix: move cleanName/colorWords/baseName to function scope (before try block)
old = """  // Fetch from Supabase
  let supaItems = [];
  try {
    const { getApi } = require('./supabase.js');
    const api = await getApi();
    const cleanName = nama.replace(/\\[.*?\\]|\\b(ready|readyh|po)\\b/gi, '').replace(/\\s+/g, ' ').trim();
    const colorWords = /\\s+(biru|kuning|pink|ungu|merah|hijau|putih|hitam|abu|coklat|gold|silver|navy|tosca|milo|mocca|army|lavender|rose|coral|cream|peach|maroon|grey|brokenwhite|offwhite)$/i;
    const baseName = cleanName.replace(colorWords, '').trim();"""

new = """  // Fetch from Supabase
  const cleanName = nama.replace(/\\[.*?\\]|\\b(ready|readyh|po)\\b/gi, '').replace(/\\s+/g, ' ').trim();
  const colorWords = /\\s+(biru|kuning|pink|ungu|merah|hijau|putih|hitam|abu|coklat|gold|silver|navy|tosca|milo|mocca|army|lavender|rose|coral|cream|peach|maroon|grey|brokenwhite|offwhite)$/i;
  const baseName = cleanName.replace(colorWords, '').trim();
  let supaItems = [];
  try {
    const { getApi } = require('./supabase.js');
    const api = await getApi();"""

if old in code:
  code = code.replace(old, new)
  open('/opt/wa-bot/index.js', 'w', encoding='utf-8').write(code)
  print('OK - moved cleanName to function scope')
else:
  print('Pattern not found - checking...')
  # Show lines around "Fetch from Supabase"
  idx = code.find('// Fetch from Supabase')
  if idx > -1:
    print(repr(code[idx:idx+400]))
  else:
    print('Could not find "Fetch from Supabase" either')
