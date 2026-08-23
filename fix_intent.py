import re
with open('/opt/wa-bot/index.js', 'r') as f:
    content = f.read()
old = 'const niat = /\\b(mau|beli|ambil|pesan|order|tambah|minat|ingin)\\b/.test(t);'
new = 'const niat = /\\b(mau+|beli|ambil|pesan|order|tambah|minat|ingin)\\b/.test(t);'
content = content.replace(old, new)
with open('/opt/wa-bot/index.js', 'w') as f:
    f.write(content)
print('Done')
