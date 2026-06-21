import sqlite3

conn = sqlite3.connect('test.db')
cursor = conn.cursor()

# Get the first BOM
cursor.execute('SELECT id, finished_product_id FROM boms LIMIT 1')
bom = cursor.fetchone()

if bom:
    bom_id = bom[0]
    # Check if the finished_product exists
    cursor.execute('SELECT name FROM products WHERE id = ?', (bom[1],))
    product = cursor.fetchone()
    
    if not product:
        print("Finished product is missing. Re-inserting...")
        cursor.execute("INSERT OR REPLACE INTO products (id, name, product_type, unit_price, on_hand_qty, uom) VALUES (?, 'Sedan Vehicle X', 'finished', 25000.00, 10, 'Unit')", (bom[1],))
        
    # Check BOM lines
    cursor.execute('SELECT id, component_product_id FROM bom_lines WHERE bom_id = ?', (bom_id,))
    lines = cursor.fetchall()
    
    components = ['V8 Engine Block', 'Premium Leather Seats', 'All-Weather Tires']
    for i, line in enumerate(lines):
        comp_name = components[i % len(components)]
        cursor.execute('SELECT name FROM products WHERE id = ?', (line[1],))
        comp_product = cursor.fetchone()
        
        if not comp_product:
            print(f"Component product {comp_name} is missing. Re-inserting...")
            cursor.execute("INSERT OR REPLACE INTO products (id, name, product_type, unit_price, on_hand_qty, uom) VALUES (?, ?, 'component', 500.00, 50, 'Unit')", (line[1], comp_name))

conn.commit()
conn.close()
print("Database fixed successfully!")
