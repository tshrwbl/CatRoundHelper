import urllib.request
import json

req = urllib.request.Request(
    'http://127.0.0.1:5000/api/query',
    data=b'{"exam": "JEE", "page": 1, "pageSize": 25, "sortBy": "jee2024", "sortDirection": "DESC"}',
    headers={'Content-Type': 'application/json'}
)

try:
    with urllib.request.urlopen(req) as res:
        print("Success!")
        print(res.read().decode()[:200])
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode())
