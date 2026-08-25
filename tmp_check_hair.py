import json
d = json.load(open('/opt/wa-bot/orders.json'))
for o in d:
    if 'HAIR' in (o.get('product','') or '').upper():
        print(json.dumps({k:v for k,v in o.items() if k in ('sender','number','product','variant','qty','hargaSatuan','timestamp','message','promoMsgId')}, indent=2))
        print('---')
