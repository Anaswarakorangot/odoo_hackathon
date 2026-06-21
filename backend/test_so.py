import sys, os
sys.path.insert(0, os.getcwd())
from app.db.database import SessionLocal
from app.models.sales import SalesOrder
from app.models.user import User
from app.api.routes.sales_orders import confirm_sales_order
db = SessionLocal()
so = db.query(SalesOrder).filter_by(reference='SO-000003').first()
admin = db.query(User).filter_by(login_id='adminuser').first()
print('Attempting to confirm SO:', so.id)
confirm_sales_order(so_id=so.id, db=db, current_user=admin)
