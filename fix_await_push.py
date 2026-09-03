import sys

code = open('/opt/wa-bot/index.js', 'r', encoding='utf-8').read()

old = '    pushOrderToSupabase(orderData);\n\n    const rekap'
new = '    await pushOrderToSupabase(orderData);\n\n    const rekap'

if old in code:
    code = code.replace(old, new)
    open('/opt/wa-bot/index.js', 'w', encoding='utf-8').write(code)
    print('OK - added await before pushOrderToSupabase')
else:
    print('Pattern not found')
    idx = code.find('pushOrderToSupabase(orderData)')
    if idx > -1:
        print('Found at:', idx)
        print(repr(code[idx-20:idx+80]))
