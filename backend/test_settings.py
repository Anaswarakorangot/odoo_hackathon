import httpx

r = httpx.get("http://127.0.0.1:8000/api/users/me/settings")
print(r.status_code, r.text)
