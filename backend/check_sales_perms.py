import sqlite3
conn = sqlite3.connect('test.db')
res = conn.execute("SELECT role, module, action FROM role_permissions WHERE role='sales'").fetchall()
print("Sales permissions:", res)
