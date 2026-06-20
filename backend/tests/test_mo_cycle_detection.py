"""
Direct unit test for cycle detection in check_mo_component_shortages.

Tests the service function directly against an in-memory SQLite DB.

Verifies:
1. Cycle detected → `continue` path (no raise, no bad state)
2. Parent's confirm action (status change) commits cleanly
3. Exactly 1 child MO created (for direct component); 0 grandchildren (cycle skipped)

Run with:
  cd s:/Projects/odoo_hackathon
  python -m pytest backend/tests/test_mo_cycle_detection.py -v -s
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret"

from decimal import Decimal
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa — registers all models with Base

from app.db.database import Base
from app.models.user import User
from app.models.product import Product, ProductTypeEnum, ProcurementTypeEnum
from app.models.bom import BOM, BomLine
from app.models.manufacturing import ManufacturingOrder, MoComponent, MOStatusEnum
from app.services import procurement_service

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)
Base.metadata.create_all(bind=engine)

_test_counter = 0


def _uid():
    return uuid4().hex[:8]


def setup_db():
    """Fresh data per call — uses unique references to avoid UNIQUE conflicts."""
    db = Session()

    uid = _uid()

    user = User(
        name=f"Tester-{uid}",
        login_id=f"tst{uid[:6]}",
        email=f"t{uid}@test.com",
        password_hash="hash",
        is_system_admin=True,
    )
    db.add(user)
    db.flush()

    prod_a = Product(
        name=f"Engine-{uid}",
        product_type=ProductTypeEnum.sub_assembly,
        sales_price=Decimal("100"),
        cost_price=Decimal("50"),
        on_hand_qty=Decimal("0"),
        procure_on_demand=True,
        procurement_type=ProcurementTypeEnum.manufacturing,
    )
    db.add(prod_a)

    prod_b = Product(
        name=f"Piston-{uid}",
        product_type=ProductTypeEnum.sub_assembly,
        sales_price=Decimal("20"),
        cost_price=Decimal("10"),
        on_hand_qty=Decimal("0"),  # shortage → triggers child MO
        procure_on_demand=True,
        procurement_type=ProcurementTypeEnum.manufacturing,
    )
    db.add(prod_b)
    db.flush()

    # BoM A: Engine needs 4 Pistons
    bom_a = BOM(reference=f"BOM-A-{uid}", finished_product_id=prod_a.id)
    db.add(bom_a)
    db.flush()
    db.add(BomLine(bom_id=bom_a.id, component_product_id=prod_b.id, qty_per_unit=Decimal("4")))
    prod_a.default_bom_id = bom_a.id

    # BoM B: Piston needs 1 Engine (CYCLE)
    bom_b = BOM(reference=f"BOM-B-{uid}", finished_product_id=prod_b.id)
    db.add(bom_b)
    db.flush()
    db.add(BomLine(bom_id=bom_b.id, component_product_id=prod_a.id, qty_per_unit=Decimal("1")))
    prod_b.default_bom_id = bom_b.id
    db.flush()

    # Parent MO: 2 Engines
    parent_mo = ManufacturingOrder(
        reference=f"MO-P-{uid}",
        finished_product_id=prod_a.id,
        bom_id=bom_a.id,
        quantity=Decimal("2"),
        status=MOStatusEnum.draft,
        auto_created=False,
        created_by=user.id,
    )
    db.add(parent_mo)
    db.flush()

    # Component: 8 pistons needed (2 × 4)
    db.add(MoComponent(
        mo_id=parent_mo.id,
        component_product_id=prod_b.id,
        to_consume=Decimal("8"),
        consumed_qty=Decimal("0"),
    ))
    db.flush()

    return db, user, prod_a, prod_b, parent_mo


def test_cycle_detection_no_exception_and_correct_child_count():
    """
    Core test: confirming an MO with cyclic components does NOT raise,
    creates exactly 1 child MO, and skips the grandchild.
    """
    db, user, prod_a, prod_b, parent_mo = setup_db()
    parent_mo_id = parent_mo.id

    try:
        # Simulate what confirm endpoint does:
        parent_mo.status = MOStatusEnum.confirmed

        # Must NOT raise — this is the key assertion
        child_mos = procurement_service.check_mo_component_shortages(
            db=db,
            mo=parent_mo,
            current_user=user,
        )

        db.commit()  # must succeed

        # Parent committed cleanly
        db.refresh(parent_mo)
        assert parent_mo.status == MOStatusEnum.confirmed, (
            f"Parent MO should be confirmed, got {parent_mo.status}"
        )
        print(f"\n  Parent MO status: {parent_mo.status.value} [OK]")

        # Exactly 1 direct child (for Piston), not 0 and not 2
        assert len(child_mos) == 1, (
            f"Expected 1 child MO, got {len(child_mos)}: "
            f"{[c.reference for c in child_mos]}"
        )
        child = child_mos[0]
        assert child.finished_product_id == prod_b.id, "Child should be for Piston"
        print(f"  Child MO {child.reference} for Piston [OK]")

        # Child quantity = 8 (to_consume 8 - on_hand 0)
        assert child.quantity == Decimal("8"), (
            f"Child qty should be 8, got {child.quantity}"
        )
        print(f"  Child qty = {child.quantity} [OK]")

        # No grandchildren - DB-level check
        all_mos = db.query(ManufacturingOrder).all()
        assert len(all_mos) == 2, (
            f"Expected 2 MOs total (parent + 1 child), got {len(all_mos)}"
        )
        print(f"  Total MOs in DB = {len(all_mos)} (parent + 1 child only) [OK]")
        print(f"\n[PASS] Cycle detection: no exception, 1 child, 0 grandchildren, parent confirmed")

    except Exception as exc:
        db.rollback()
        raise AssertionError(
            f"Should not have raised: {type(exc).__name__}: {exc}"
        ) from exc
    finally:
        db.close()


def test_cycle_detection_parent_link_correct():
    """Child.parent_mo_id must link back to parent."""
    db, user, prod_a, prod_b, parent_mo = setup_db()
    parent_mo_id = parent_mo.id

    try:
        parent_mo.status = MOStatusEnum.confirmed
        child_mos = procurement_service.check_mo_component_shortages(
            db=db, mo=parent_mo, current_user=user
        )
        db.commit()

        assert len(child_mos) == 1
        child = child_mos[0]
        assert child.parent_mo_id == parent_mo_id, (
            f"child.parent_mo_id={child.parent_mo_id} != parent.id={parent_mo_id}"
        )
        print(f"\n  child.parent_mo_id == parent.id ✓")
        print(f"[PASS] Parent link correct")
    finally:
        db.close()
