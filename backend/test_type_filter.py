import requests

# Try to find a working sales user by checking the DB directly
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app.db.database import SessionLocal
from app.models.user import User

db = SessionLocal()
sales_user = db.query(User).filter(User.role == 'sales', User.is_system_admin == False).first()
db.close()

if not sales_user:
    print("No sales users found!")
    exit()

print(f"Testing with: {sales_user.login_id}")

# We can't get the password from DB (hashed). Use the API key approach instead.
# Just test the endpoint directly with a known admin token to verify the filter works
admin = db2 = SessionLocal()
admin_user = db2.query(User).filter(User.is_system_admin == True).first()
db2.close()

print(f"\nVerifying endpoint exists:")
r = requests.get('http://localhost:8000/api/products?type=finished_good')
print(f"Status without auth: {r.status_code}")  # Should be 401/403

# Test that the ?type param is accepted
r2 = requests.get('http://localhost:8000/docs')
print(f"API docs available: {r2.status_code}")

# Check if the backend picked up the new code
import urllib.request
req = urllib.request.urlopen('http://localhost:8000/openapi.json')
import json
spec = json.loads(req.read())
products_get = spec['paths'].get('/api/products', {}).get('get', {})
params = [p['name'] for p in products_get.get('parameters', [])]
print(f"\nGET /api/products parameters: {params}")
print("'type' param present:", 'type' in params)
