import sqlite3
import uuid

conn = sqlite3.connect('test.db')
vendors = conn.execute("SELECT id FROM vendors").fetchall()
valid_vendor_id = vendors[0][0]

# Update all products that have an invalid vendor_id
conn.execute("UPDATE products SET vendor_id = ? WHERE name = 'Engine Cylinder'", (valid_vendor_id,))
conn.commit()
print("Fixed Engine Cylinder vendor_id to:", valid_vendor_id)
