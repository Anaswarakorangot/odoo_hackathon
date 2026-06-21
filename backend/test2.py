import httpx
print(httpx.get('http://localhost:8000/api/boms/024268d4eaa042c788561fd8d5f22af9', headers={'Authorization': 'Bearer admin'}).text)
