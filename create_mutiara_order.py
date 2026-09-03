import json, urllib.request, urllib.parse

url_base = 'https://tmnykmpdqdavspmirspw.supabase.co'
key = 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF'

data = json.dumps({'email': 'nurulazizahy@gmail.com', 'password': 'drdiskman'}).encode()
req = urllib.request.Request(url_base + '/auth/v1/token?grant_type=password', data=data, headers={'apikey': key, 'Content-Type': 'application/json'})
resp = urllib.request.urlopen(req)
auth = json.loads(resp.read())
token = auth['access_token']

def supa_get(suffix):
    url = url_base + '/rest/v1/' + suffix
    req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    return json.loads(urllib.request.urlopen(req).read())

def supa_post(suffix, body):
    url = url_base + '/rest/v1/' + suffix
    d = json.dumps(body).encode()
    req = urllib.request.Request(url, data=d, method='POST', headers={'apikey': key, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    return json.loads(urllib.request.urlopen(req).read())

# Find product
q = urllib.parse.quote('bantal memory foam')
prods = supa_get('products?select=id,name,price,stock_type&name=ilike.*' + q + '*')
print('Products:', json.dumps(prods, indent=2, ensure_ascii=False))

# Find product_id
prod_id = prods[0]['id'] if prods else None
prod_name = prods[0]['name'] if prods else None
print('Product ID:', prod_id, '| Name:', prod_name)

# Create order for Mutiara
cust_id = 'c0000001-0000-4000-8000-000000000028'
now = '2026-09-02T10:00:00+07:00'

order_body = {
    'customer_id': cust_id,
    'total': 89000,
    'paid_total': 0,
    'payment_status': 'unpaid',
    'fulfillment_status': 'belum_ready',
    'order_type': 'penjualan',
    'notes': 'WA: mau bantal guling',
    'created_at': now
}

order = supa_post('orders', order_body)
order_id = order[0]['id']
print('Order created:', order_id)

# Create order item
item_body = {
    'order_id': order_id,
    'product_name': prod_name,
    'product_id': prod_id,
    'variant': 'bantal+guling',
    'price': 89000,
    'quantity': 1,
    'discount': 0,
    'paid_value': 0,
    'status': 'pending'
}

item = supa_post('order_items', item_body)
print('Order item created:', item[0]['id'] if isinstance(item, list) else item)
print('DONE: Mutiara order bantal+guling qty 1 Rp89,000')
