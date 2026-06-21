import sqlite3
conn = sqlite3.connect('test.db')
res = conn.execute("SELECT name, role, is_system_admin FROM users WHERE name LIKE '%Sales%'").fetchall()
print(res)
