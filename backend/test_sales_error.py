import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app.db.database import SessionLocal
from app.api.routes.sales_orders import list_sales_orders

db = SessionLocal()
try:
    print("Testing list_sales_orders...")
    res = list_sales_orders(db=db, search=None, status=None)
    print("Success:", len(res))
except Exception as e:
    import traceback
    traceback.print_exc()
