with open('/opt/wa-bot/index.js', 'r') as f:
    content = f.read()

old = """        const botLidUser = (sock.user?.lid || '').split('@')[0].replace(/\\D/g, '');
        const isLidMatch = botLidUser && quotedJid === botLidUser;
        const isFromMe = msg.key.fromMe;
        const isAdminNumber = ADMIN_NUMBER_DIGITS && quotedJid === ADMIN_NUMBER_DIGITS;

        // isLidFormat: hanya jika @lid yang match dengan bot's own LID
        const isLidFormat = quotedParticipant.endsWith('@lid') && botLidUser && quotedJid === botLidUser;
        const isPromoSenderLid = currentPromo.senderLid && quotedParticipant === currentPromo.senderLid;
        const isAdminQuote = isFromMe || isLidMatch || isAdminNumber || isLidFormat || isPromoSenderLid;

        console.log('QUOTED check:', { isFromMe, isLidMatch, isAdminNumber, isLidFormat, quotedParticipant, botLidUser: botLidUser || '(kosong)' });"""

new = """        const botLidUser = (sock.user?.lid || '').split('@')[0].replace(/\\D/g, '');
        const isLidMatch = botLidUser && quotedJid === botLidUser;
        const isFromMe = msg.key.fromMe;
        const isAdminNumber = ADMIN_NUMBER_DIGITS && quotedJid === ADMIN_NUMBER_DIGITS;

        // isLidFormat: hanya jika @lid yang match dengan bot's own LID
        const isLidFormat = quotedParticipant.endsWith('@lid') && botLidUser && quotedJid === botLidUser;
        const isPromoSenderLid = currentPromo.senderLid && quotedParticipant === currentPromo.senderLid;

        // Resolve LID to phone number via lidMap, then check admin number
        let resolvedAdminPhone = false;
        if (quotedParticipant.endsWith('@lid') && lidMap[quotedParticipant]) {
          const resolvedPhone = lidMap[quotedParticipant].replace(/\\D/g, '');
          resolvedAdminPhone = ADMIN_NUMBER_DIGITS && resolvedPhone === ADMIN_NUMBER_DIGITS;
        }

        const isAdminQuote = isFromMe || isLidMatch || isAdminNumber || isLidFormat || isPromoSenderLid || resolvedAdminPhone;

        console.log('QUOTED check:', { isFromMe, isLidMatch, isAdminNumber, isLidFormat, isPromoSenderLid, resolvedAdminPhone, quotedParticipant, botLidUser: botLidUser || '(kosong)', resolvedPhone: lidMap[quotedParticipant] || '(none)' });"""

if old in content:
    content = content.replace(old, new)
    with open('/opt/wa-bot/index.js', 'w') as f:
        f.write(content)
    print('OK')
else:
    print('NOT FOUND')
