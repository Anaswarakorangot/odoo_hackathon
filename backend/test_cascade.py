"""
Cascade and Cycle Detection Tests

Run BEFORE rehearsal to verify:
1. Cycle detection actually works (doesn't hang/crash)
2. Multi-level cascade creates child MOs with correct BoM data

Usage: python test_cascade.py
Requires: Backend running, admin user exists
"""
import sys
from decimal import Decimal
from uuid import UUID

# Add app to path
sys.path.insert(0, ".")

from sqlalchemy.orm import Session
from app.db.database import SessionLocal, engine, Base
from app.models.product import Product, ProductTypeEnum, ProcurementTypeEnum
from app.models.bom import BOM, BomLine
from app.models.manufacturing import ManufacturingOrder, MoComponent, MOStatusEnum
from app.models.user import User

# Ensure tables exist
Base.metadata.create_all(bind=engine)


def get_admin_user(db: Session) -> User:
    """Get first admin user for testing."""
    user = db.query(User).filter(User.is_system_admin == True).first()
    if not user:
        user = db.query(User).first()
    if not user:
        raise RuntimeError("No users in database - cannot run tests")
    return user


def cleanup_test_data(db: Session, prefix: str = "TEST_CASCADE_"):
    """Remove test data from previous runs."""
    # Delete MOs first (FK constraints)
    test_mos = db.query(ManufacturingOrder).filter(
        ManufacturingOrder.reference.like(f"{prefix}%")
    ).all()
    for mo in test_mos:
        db.delete(mo)
    db.flush()

    # Clear default_bom_id on products BEFORE deleting BoMs (breaks circular FK)
    test_products = db.query(Product).filter(Product.name.like(f"{prefix}%")).all()
    for prod in test_products:
        prod.default_bom_id = None
    db.flush()

    # Delete BoMs (now safe - no FKs pointing to them)
    test_boms = db.query(BOM).filter(BOM.reference.like(f"{prefix}%")).all()
    for bom in test_boms:
        db.delete(bom)
    db.flush()

    # Delete products
    for prod in test_products:
        db.delete(prod)

    db.commit()
    print(f"[CLEANUP] Removed previous test data with prefix '{prefix}'")


def test_cycle_detection(db: Session, user: User) -> bool:
    """
    TEST 1: Cycle Detection

    Create A -> B -> A cycle and confirm MO for A.
    Expected: Clean warning log, no child MO for A (cycle detected), no crash.
    """
    print("\n" + "="*60)
    print("TEST 1: CYCLE DETECTION")
    print("="*60)

    # Create Product A
    prod_a = Product(
        name="TEST_CASCADE_ProductA",
        product_type=ProductTypeEnum.sub_assembly,
        procure_on_demand=True,
        procurement_type=ProcurementTypeEnum.manufacturing,
        on_hand_qty=Decimal("0"),  # Zero stock to trigger cascade
    )
    db.add(prod_a)

    # Create Product B
    prod_b = Product(
        name="TEST_CASCADE_ProductB",
        product_type=ProductTypeEnum.sub_assembly,
        procure_on_demand=True,
        procurement_type=ProcurementTypeEnum.manufacturing,
        on_hand_qty=Decimal("0"),
    )
    db.add(prod_b)
    db.flush()

    print(f"[SETUP] Created Product A: {prod_a.id}")
    print(f"[SETUP] Created Product B: {prod_b.id}")

    # Create BoM for A with component B
    bom_a = BOM(
        reference="TEST_CASCADE_BOM_A",
        finished_product_id=prod_a.id,
    )
    db.add(bom_a)
    db.flush()

    bom_line_a = BomLine(
        bom_id=bom_a.id,
        component_product_id=prod_b.id,
        qty_per_unit=Decimal("1"),
    )
    db.add(bom_line_a)

    # Create BoM for B with component A (THE CYCLE)
    bom_b = BOM(
        reference="TEST_CASCADE_BOM_B",
        finished_product_id=prod_b.id,
    )
    db.add(bom_b)
    db.flush()

    bom_line_b = BomLine(
        bom_id=bom_b.id,
        component_product_id=prod_a.id,  # CYCLE: B needs A
        qty_per_unit=Decimal("1"),
    )
    db.add(bom_line_b)

    # Set default BoMs
    prod_a.default_bom_id = bom_a.id
    prod_b.default_bom_id = bom_b.id
    db.flush()

    print(f"[SETUP] Created BoM A (needs B): {bom_a.id}")
    print(f"[SETUP] Created BoM B (needs A): {bom_b.id}")
    print("[SETUP] Cycle created: A -> B -> A")

    # Create MO for Product A
    mo = ManufacturingOrder(
        reference="TEST_CASCADE_MO_CYCLE",
        finished_product_id=prod_a.id,
        bom_id=bom_a.id,
        quantity=Decimal("1"),
        assignee_id=user.id,
        status=MOStatusEnum.draft,
        created_by=user.id,
    )
    db.add(mo)
    db.flush()

    # Add component from BoM
    mo_comp = MoComponent(
        mo_id=mo.id,
        component_product_id=prod_b.id,
        to_consume=Decimal("1"),
        consumed_qty=Decimal("0"),
    )
    db.add(mo_comp)
    db.commit()

    print(f"[SETUP] Created MO for A: {mo.id}")
    print("[TEST] Attempting to confirm MO (this triggers cascade)...")

    # Import and call the cascade function directly
    from app.services.procurement_service import check_mo_component_shortages

    try:
        child_mos = check_mo_component_shortages(
            db=db,
            mo=mo,
            current_user=user,
        )

        print(f"[RESULT] Cascade returned {len(child_mos)} child MO(s)")

        # Check what happened
        if len(child_mos) == 1:
            child = child_mos[0]
            print(f"[RESULT] Child MO created for: {child.finished_product_id}")

            # Did it try to create a grandchild for A? (would be the cycle)
            grandchild_for_a = db.query(ManufacturingOrder).filter(
                ManufacturingOrder.parent_mo_id == child.id,
                ManufacturingOrder.finished_product_id == prod_a.id,
            ).first()

            if grandchild_for_a:
                print("[FAIL] CYCLE NOT DETECTED - Created grandchild MO for A!")
                return False
            else:
                print("[PASS] Cycle detected - no grandchild MO for A created")
                return True
        elif len(child_mos) == 0:
            print("[INFO] No child MOs created at all")
            return True  # Acceptable - might mean cascade didn't trigger
        else:
            print(f"[WARN] Unexpected number of child MOs: {len(child_mos)}")
            return False

    except RecursionError as e:
        print(f"[FAIL] RECURSION ERROR - Cycle detection failed!")
        print(f"[FAIL] {e}")
        return False
    except Exception as e:
        print(f"[FAIL] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_multi_level_cascade(db: Session, user: User) -> bool:
    """
    TEST 2: Multi-Level Cascade

    Create Car -> Engine -> Piston hierarchy.
    Confirm MO for Car, verify:
    - Child MO for Engine created
    - Child MO has correct components from Engine's BoM (Piston)
    - Quantities are correctly scaled
    """
    print("\n" + "="*60)
    print("TEST 2: MULTI-LEVEL CASCADE")
    print("="*60)

    # Create Piston (raw component, no cascade)
    piston = Product(
        name="TEST_CASCADE_Piston",
        product_type=ProductTypeEnum.raw_component,
        procure_on_demand=False,  # No further cascade
        on_hand_qty=Decimal("100"),  # Has stock
    )
    db.add(piston)

    # Create Engine (sub-assembly, triggers cascade)
    engine = Product(
        name="TEST_CASCADE_Engine",
        product_type=ProductTypeEnum.sub_assembly,
        procure_on_demand=True,
        procurement_type=ProcurementTypeEnum.manufacturing,
        on_hand_qty=Decimal("0"),  # Zero stock - will trigger cascade
    )
    db.add(engine)

    # Create Car (finished good)
    car = Product(
        name="TEST_CASCADE_Car",
        product_type=ProductTypeEnum.finished_good,
        procure_on_demand=False,
        on_hand_qty=Decimal("0"),
    )
    db.add(car)
    db.flush()

    print(f"[SETUP] Created Piston: {piston.id}")
    print(f"[SETUP] Created Engine: {engine.id}")
    print(f"[SETUP] Created Car: {car.id}")

    # Create BoM for Engine (needs 4 Pistons per unit)
    bom_engine = BOM(
        reference="TEST_CASCADE_BOM_Engine",
        finished_product_id=engine.id,
    )
    db.add(bom_engine)
    db.flush()

    bom_line_piston = BomLine(
        bom_id=bom_engine.id,
        component_product_id=piston.id,
        qty_per_unit=Decimal("4"),  # 4 pistons per engine
    )
    db.add(bom_line_piston)

    # Create BoM for Car (needs 1 Engine per unit)
    bom_car = BOM(
        reference="TEST_CASCADE_BOM_Car",
        finished_product_id=car.id,
    )
    db.add(bom_car)
    db.flush()

    bom_line_engine = BomLine(
        bom_id=bom_car.id,
        component_product_id=engine.id,
        qty_per_unit=Decimal("1"),  # 1 engine per car
    )
    db.add(bom_line_engine)

    # Set default BoMs
    engine.default_bom_id = bom_engine.id
    car.default_bom_id = bom_car.id
    db.flush()

    print(f"[SETUP] Created BoM for Engine (needs 4 Pistons): {bom_engine.id}")
    print(f"[SETUP] Created BoM for Car (needs 1 Engine): {bom_car.id}")

    # Create MO for Car (qty=2, so needs 2 engines)
    mo_car = ManufacturingOrder(
        reference="TEST_CASCADE_MO_Car",
        finished_product_id=car.id,
        bom_id=bom_car.id,
        quantity=Decimal("2"),  # Making 2 cars
        assignee_id=user.id,
        status=MOStatusEnum.draft,
        created_by=user.id,
    )
    db.add(mo_car)
    db.flush()

    # Add component (2 engines needed for 2 cars)
    mo_comp_engine = MoComponent(
        mo_id=mo_car.id,
        component_product_id=engine.id,
        to_consume=Decimal("2"),  # 2 engines for 2 cars
        consumed_qty=Decimal("0"),
    )
    db.add(mo_comp_engine)
    db.commit()

    print(f"[SETUP] Created MO for Car (qty=2): {mo_car.id}")
    print("[TEST] Confirming MO (should trigger cascade for Engine)...")

    # Run cascade
    from app.services.procurement_service import check_mo_component_shortages

    try:
        child_mos = check_mo_component_shortages(
            db=db,
            mo=mo_car,
            current_user=user,
        )

        db.commit()

        print(f"[RESULT] Cascade created {len(child_mos)} child MO(s)")

        if len(child_mos) == 0:
            print("[FAIL] No child MO created for Engine!")
            return False

        # Find the Engine MO
        engine_mo = None
        for child in child_mos:
            if child.finished_product_id == engine.id:
                engine_mo = child
                break

        if not engine_mo:
            print("[FAIL] No child MO found for Engine product!")
            return False

        print(f"[RESULT] Child MO for Engine: {engine_mo.reference}")
        print(f"[RESULT] Child MO quantity: {engine_mo.quantity}")
        print(f"[RESULT] Child MO parent_mo_id: {engine_mo.parent_mo_id}")
        print(f"[RESULT] Child MO bom_id: {engine_mo.bom_id}")

        # Verify parent_mo_id is set correctly
        if engine_mo.parent_mo_id != mo_car.id:
            print(f"[FAIL] parent_mo_id wrong! Expected {mo_car.id}, got {engine_mo.parent_mo_id}")
            return False
        print("[CHECK] parent_mo_id: CORRECT")

        # Verify quantity (should be 2, matching the shortage)
        if engine_mo.quantity != Decimal("2"):
            print(f"[FAIL] Quantity wrong! Expected 2, got {engine_mo.quantity}")
            return False
        print("[CHECK] quantity: CORRECT (2)")

        # Verify BoM is Engine's BoM, not Car's
        if engine_mo.bom_id != bom_engine.id:
            print(f"[FAIL] bom_id wrong! Expected Engine's BoM {bom_engine.id}, got {engine_mo.bom_id}")
            return False
        print("[CHECK] bom_id: CORRECT (Engine's BoM)")

        # Verify components are from Engine's BoM (Pistons), not Car's
        engine_mo_components = db.query(MoComponent).filter(
            MoComponent.mo_id == engine_mo.id
        ).all()

        print(f"[RESULT] Child MO has {len(engine_mo_components)} component(s)")

        if len(engine_mo_components) != 1:
            print(f"[FAIL] Expected 1 component (Piston), got {len(engine_mo_components)}")
            return False

        piston_comp = engine_mo_components[0]
        print(f"[RESULT] Component product_id: {piston_comp.component_product_id}")
        print(f"[RESULT] Component to_consume: {piston_comp.to_consume}")

        if piston_comp.component_product_id != piston.id:
            print(f"[FAIL] Component wrong! Expected Piston {piston.id}, got {piston_comp.component_product_id}")
            return False
        print("[CHECK] Component is Piston: CORRECT")

        # Verify quantity scaling: 2 engines * 4 pistons/engine = 8 pistons
        expected_piston_qty = Decimal("8")
        if piston_comp.to_consume != expected_piston_qty:
            print(f"[FAIL] Piston qty wrong! Expected {expected_piston_qty}, got {piston_comp.to_consume}")
            return False
        print(f"[CHECK] Piston quantity: CORRECT (2 engines * 4 pistons = 8)")

        print("\n[PASS] Multi-level cascade works correctly!")
        return True

    except Exception as e:
        print(f"[FAIL] Error during cascade: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("="*60)
    print("CASCADE AND CYCLE DETECTION TESTS")
    print("="*60)

    db = SessionLocal()

    try:
        user = get_admin_user(db)
        print(f"[SETUP] Using user: {user.name} ({user.id})")

        # Cleanup previous test data
        cleanup_test_data(db)

        # TEST 1: Cycle Detection (run this FIRST)
        cycle_result = test_cycle_detection(db, user)

        # Cleanup between tests
        db.rollback()
        cleanup_test_data(db)

        # TEST 2: Multi-Level Cascade
        cascade_result = test_multi_level_cascade(db, user)

        # Final cleanup
        db.rollback()
        cleanup_test_data(db)

        # Summary
        print("\n" + "="*60)
        print("SUMMARY")
        print("="*60)
        print(f"Cycle Detection Test:     {'PASS' if cycle_result else 'FAIL'}")
        print(f"Multi-Level Cascade Test: {'PASS' if cascade_result else 'FAIL'}")

        if cycle_result and cascade_result:
            print("\n[SUCCESS] All tests passed - safe to proceed to rehearsal")
            return 0
        else:
            print("\n[WARNING] One or more tests failed - review before rehearsal")
            return 1

    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
