import json
orders = json.load(open('/opt/wa-bot/orders.json'))
for o in orders:
    s = str(o.get('sender','')) + str(o.get('customer',''))
    if 'ratih' in s.lower() or 'tahsin' in s.lower() or 'bu ra' in s.lower():
        pushed = o.get('pushed', 'MISSING')
        print(f'  pushed={pushed}  customer={o.get("customer","")}  product={o.get("product","")}  qty={o.get("quantity","")}  variant={o.get("variant","")}  orderType={o.get("orderType","")}')
