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

# Find product - use ilike with % encoding
prods = supa_get("products?select=id,name,price,stock_type&name=ilike.*bantal*memory*foam*")
print('Products:', json.dumps(prods, indent=2, ensure_ascii=False))

if not prods:
    # Try broader search
    prods = supa_get("products?select=id,name,price,stock_type&name=ilike.*bantal*")
    print('Broader search:', json.dumps(prods, indent=2, ensure_ascii=False))

prod_id = prods[0]['id'] if prods else None
prod_name = prods[0]['name'] if prods else None
print('Product ID:', prod_id, '| Name:', prod_name)
