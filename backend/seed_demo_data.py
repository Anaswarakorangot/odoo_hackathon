import sys
import os
from decimal import Decimal

# Add the backend folder to sys.path so we can import app modules
sys.path.insert(0, os.path.dirname(__file__))

from app.db.database import SessionLocal
from app.models.vendor_customer import Vendor, Customer
from app.models.product import Product, ProductTypeEnum, ProcurementTypeEnum
from app.models.bom import BOM, BomLine, BomOperation
from app.models.manufacturing import ManufacturingOrder, MoComponent, WorkOrder
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.purchase import PurchaseOrder, PurchaseOrderLine
from app.models.user import User, RoleEnum
from app.core.security import get_password_hash

def seed_data():
    db = SessionLocal()
    print("Seeding NEOTORQUE Demo Data...")

    # 0. Create Demo Users
    admin_user = db.query(User).filter(User.login_id == "adminuser").first()
    if not admin_user:
        admin_user = User(
            name="System Admin",
            login_id="adminuser",
            email="admin@neotorque.com",
            password_hash=get_password_hash("Admin@123"),
            is_system_admin=True,
            role=RoleEnum.owner
        )
        db.add(admin_user)

    sales_user = db.query(User).filter(User.login_id == "salesuser").first()
    if not sales_user:
        sales_user = User(
            name="Demo Sales Rep",
            login_id="salesuser",
            email="sales@neotorque.com",
            password_hash=get_password_hash("Sales@123"),
            is_system_admin=False,
            role=RoleEnum.sales
        )
        db.add(sales_user)

    db.commit()
    print("[OK] Demo Users created (adminuser / Admin@123) and (salesuser / Sales@123).")

    # 1. Create Vendor and Customer
    vendor = db.query(Vendor).filter(Vendor.name == "Global Auto Parts Ltd").first()
    if not vendor:
        vendor = Vendor(
            name="Global Auto Parts Ltd",
            address="100 Factory Road, Industrial Hub"
        )
        db.add(vendor)

    customer = db.query(Customer).filter(Customer.name == "Elite Auto Dealers").first()
    if not customer:
        customer = Customer(
            name="Elite Auto Dealers",
            address="200 Showroom Avenue, Metro City"
        )
        db.add(customer)

    db.commit()
    print("[OK] Vendor and Customer created.")

    # 2. Create Raw Components
    raw_parts = [
        {"name": "V8 Engine Block", "cost": 5000},
        {"name": "Steel Chassis Frame", "cost": 2000},
        {"name": "Premium Alloy Wheel", "cost": 300},
        {"name": "Interior Dashboard Unit", "cost": 1500},
    ]
    raw_products = {}
    for part in raw_parts:
        p = db.query(Product).filter(Product.name == part["name"]).first()
        if not p:
            p = Product(
                name=part["name"],
                product_type=ProductTypeEnum.raw_component,
                cost_price=Decimal(str(part["cost"])),
                procure_on_demand=True,
                procurement_type=ProcurementTypeEnum.purchase,
                vendor_id=vendor.id
            )
            db.add(p)
            db.flush()
        raw_products[part["name"]] = p

    # 3. Create Finished Good
    fg = db.query(Product).filter(Product.name == "Sedan CityDrive X1").first()
    if not fg:
        fg = Product(
            name="Sedan CityDrive X1",
            product_type=ProductTypeEnum.finished_good,
            sales_price=Decimal("25000.00"),
            cost_price=Decimal("10000.00"),
            procure_on_demand=True,
            procurement_type=ProcurementTypeEnum.manufacturing
        )
        db.add(fg)
        db.flush()

    db.commit()
    print("[OK] Products created.")

    # 4. Create BOM for Finished Good
    bom = db.query(BOM).filter(BOM.finished_product_id == fg.id).first()
    if not bom:
        bom = BOM(
            reference="BOM-X1-MAIN",
            finished_product_id=fg.id
        )
        db.add(bom)
        db.flush()

        # Add BOM Lines (The recipe)
        lines = [
            (raw_products["V8 Engine Block"].id, Decimal("1")),
            (raw_products["Steel Chassis Frame"].id, Decimal("1")),
            (raw_products["Premium Alloy Wheel"].id, Decimal("4")),
            (raw_products["Interior Dashboard Unit"].id, Decimal("1")),
        ]
        for comp_id, qty in lines:
            db.add(BomLine(bom_id=bom.id, component_product_id=comp_id, qty_per_unit=qty))

        # Add BOM Operations (The labor)
        ops = [
            (1, "Chassis & Engine Assembly", "Assembly Line 1", 120),
            (2, "Interior Fitting", "Assembly Line 2", 90),
            (3, "Final QA & Road Test", "Testing Facility", 45),
        ]
        for seq, name, wc, dur in ops:
            db.add(BomOperation(
                bom_id=bom.id, sequence=seq, operation_name=name,
                work_center=wc, expected_duration_min=dur
            ))

        # Link BOM to product
        fg.default_bom_id = bom.id
        db.add(fg)
        db.commit()
        print("[OK] Bill of Materials created.")
    else:
        print("[OK] Bill of Materials already exists.")

    print("\n[DONE] Seed Complete!")
    print("\n--- HOW TO TEST THE FLOW ---")
    print("1. Go to the Sales Orders page and create a new order for 'Elite Auto Dealers'.")
    print("2. Add 5 x 'Sedan CityDrive X1' to the order. Save it as Draft.")
    print("3. Click 'Confirm' on the Sales Order.")
    print("4. Go to Manufacturing Orders. You will see an auto-generated MO for 5 x Sedan CityDrive X1.")
    print("5. Click 'Confirm' on the MO. You will see shortages for the raw materials (since stock is 0).")
    print("6. Go to Purchase Orders. The system auto-generated a PO to 'Global Auto Parts Ltd' for all the missing engines and wheels!")
    print("7. Receive the PO, then go back and Produce the MO, then go back and Deliver the SO.")

if __name__ == "__main__":
    seed_data()
