import re

with open('/opt/wa-bot/index.js', 'r') as f:
    content = f.read()

# 1. Add senderLid to tagged promo
content = content.replace(
    'currentPromo = { ...tagged, sender: senderName, waktu:',
    'currentPromo = { ...tagged, sender: senderName, senderLid: participant, waktu:'
)

# 2. Add senderLid to parsePromo fallback
content = content.replace(
    'currentPromo = { ...parsePromo(text), sender: senderName, waktu:',
    'currentPromo = { ...parsePromo(text), sender: senderName, senderLid: participant, waktu:'
)

# 3. Fix isAdminQuote check
old_check = "const isLidFormat = quotedParticipant.endsWith('@lid') && botLidUser && quotedJid === botLidUser;\n        const isAdminQuote = isFromMe || isLidMatch || isAdminNumber || isLidFormat;"
new_check = "const isLidFormat = quotedParticipant.endsWith('@lid') && botLidUser && quotedJid === botLidUser;\n        const isPromoSenderLid = currentPromo.senderLid && quotedParticipant === currentPromo.senderLid;\n        const isAdminQuote = isFromMe || isLidMatch || isAdminNumber || isLidFormat || isPromoSenderLid;"
content = content.replace(old_check, new_check)

with open('/opt/wa-bot/index.js', 'w') as f:
    f.write(content)

print('Done')
