import sqlite3
conn = sqlite3.connect('test.db')
print("Vendors:")
for row in conn.execute("SELECT id FROM vendors"): print(row)
print("Products:")
for row in conn.execute("SELECT name, vendor_id FROM products WHERE vendor_id IS NOT NULL"): print(row)
