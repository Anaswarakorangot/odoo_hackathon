"""
Procurement Service - Auto-creates Purchase Orders or Manufacturing Orders
when a Sales Order confirms with a shortage, or when a Manufacturing Order
confirms with component shortages (recursive MO cascade).

Called from:
- POST /sales-orders/{id}/confirm - once per line, for SO shortage handling
- POST /manufacturing-orders/{id}/confirm - for MO component shortage cascade
"""
import logging
from decimal import Decimal
from typing import List, Optional, Set, Union
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.bom import BOM, BomLine, BomOperation
from app.models.manufacturing import ManufacturingOrder, MoComponent, WorkOrder, MOStatusEnum
from app.models.product import Product, ProcurementTypeEnum
from app.models.purchase import PurchaseOrder, PurchaseOrderLine, POStatusEnum
from app.models.sales import SalesOrderLine
from app.models.user import User
from app.models.vendor_customer import Vendor
from app.services import audit_service

logger = logging.getLogger(__name__)


def _get_next_po_reference(db: Session) -> str:
    """Generate next PO reference like PO-000001, PO-000002, etc."""
    count = db.query(func.count(PurchaseOrder.id)).scalar() or 0
    next_num = count + 1
    return f"PO-{next_num:06d}"


def _get_next_mo_reference(db: Session) -> str:
    """Generate next MO reference like MO-000001, MO-000002, etc."""
    count = db.query(func.count(ManufacturingOrder.id)).scalar() or 0
    next_num = count + 1
    return f"MO-{next_num:06d}"


def check_and_trigger_procurement(
    db: Session,
    so_line: SalesOrderLine,
    sales_order_id: UUID,
    current_user: User,
) -> Union[PurchaseOrder, ManufacturingOrder, None]:
    """
    Check if this sales order line needs auto-procurement.
    Returns the auto-created order (PO or MO) if one was created, None if no procurement needed.

    Called during SO confirm, in the same transaction. If this function raises an exception,
    the SO confirm transaction rolls back.

    Logic (EC-2, EC-3, EC-4 locked decisions):
    1. Check procure_on_demand flag
    2. Lock product row for concurrent safety (EC-3)
    3. Calculate shortage using on_hand_qty (EC-4)
    4. Auto-create PO or MO based on procurement_type
    """
    # Step 1: Get product and check procure_on_demand
    # Lock the product row to serialize against concurrent SO confirms (EC-3)
    product = (
        db.query(Product)
        .filter(Product.id == so_line.product_id)
        .with_for_update()
        .first()
    )

    if not product:
        logger.warning(f"Product {so_line.product_id} not found for SO line {so_line.id}")
        return None

    if not product.procure_on_demand:
        return None

    # Step 2: Calculate shortage (EC-4)
    # Use on_hand_qty per spec, not free_to_use_qty
    shortage = so_line.ordered_qty - product.on_hand_qty

    # EC-2: shortage exists only if on_hand_qty < ordered_qty (strictly <)
    # So if shortage <= 0, no procurement needed
    if shortage <= 0:
        return None

    # Step 3: Auto-create based on procurement_type
    if product.procurement_type == ProcurementTypeEnum.purchase:
        return _create_purchase_order(
            db=db,
            product=product,
            shortage=shortage,
            sales_order_id=sales_order_id,
            current_user=current_user,
        )
    elif product.procurement_type == ProcurementTypeEnum.manufacturing:
        return _create_manufacturing_order(
            db=db,
            product=product,
            shortage=shortage,
            sales_order_id=sales_order_id,
            current_user=current_user,
        )
    else:
        # Defensive: procurement_type is None or unknown
        logger.warning(
            f"Product {product.id} has procure_on_demand=True but "
            f"procurement_type={product.procurement_type}. Skipping auto-procurement."
        )
        return None


def _create_purchase_order(
    db: Session,
    product: Product,
    shortage: Decimal,
    sales_order_id: UUID,
    current_user: User,
) -> PurchaseOrder:
    """
    Create a Purchase Order for the shortage quantity.

    - Draft status
    - auto_created=True
    - source_sales_order_id links back to the triggering SO
    - One line for the product with ordered_qty=shortage
    """
    if not product.vendor_id:
        raise ValueError(
            f"Cannot create PO for product '{product.name}': no vendor assigned. "
            f"Set product.vendor_id before enabling procure_on_demand with type=purchase."
        )

    # Get vendor for address snapshot
    vendor = db.query(Vendor).filter(Vendor.id == product.vendor_id).first()
    if not vendor:
        raise ValueError(f"Vendor {product.vendor_id} not found for product '{product.name}'")

    # Generate reference
    reference = _get_next_po_reference(db)

    # Create PO
    po = PurchaseOrder(
        reference=reference,
        vendor_id=product.vendor_id,
        vendor_address=vendor.address,
        responsible_person_id=current_user.id,
        status=POStatusEnum.draft,
        auto_created=True,
        source_sales_order_id=sales_order_id,
        created_by=current_user.id,
    )
    db.add(po)
    db.flush()  # Get PO id

    # Create single line
    po_line = PurchaseOrderLine(
        purchase_order_id=po.id,
        product_id=product.id,
        ordered_qty=shortage,
        received_qty=Decimal("0"),
        cost_price=product.cost_price,
    )
    db.add(po_line)

    # Audit log
    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Purchase",
        record_type="PurchaseOrder",
        record_id=po.id,
        action="created",
    )

    logger.info(
        f"Auto-created PO {reference} for product '{product.name}' "
        f"qty={shortage} from SO {sales_order_id}"
    )

    return po


def _create_manufacturing_order(
    db: Session,
    product: Product,
    shortage: Decimal,
    sales_order_id: UUID,
    current_user: User,
) -> ManufacturingOrder:
    """
    Create a Manufacturing Order for the shortage quantity.

    - Draft status
    - auto_created=True
    - source_sales_order_id links back to the triggering SO
    - Populates components from BoM lines (scaled by quantity)
    - Populates work_orders from BoM operations (scaled by quantity)
    """
    # Generate reference
    reference = _get_next_mo_reference(db)

    # Create MO
    mo = ManufacturingOrder(
        reference=reference,
        finished_product_id=product.id,
        bom_id=product.default_bom_id,
        quantity=shortage,
        assignee_id=current_user.id,
        status=MOStatusEnum.draft,
        auto_created=True,
        source_sales_order_id=sales_order_id,
        created_by=current_user.id,
    )
    db.add(mo)
    db.flush()  # Get MO id

    # Populate components from BoM if present
    if mo.bom_id:
        bom_lines = db.query(BomLine).filter(BomLine.bom_id == mo.bom_id).all()
        for bom_line in bom_lines:
            mo_component = MoComponent(
                mo_id=mo.id,
                component_product_id=bom_line.component_product_id,
                to_consume=bom_line.qty_per_unit * shortage,  # Scale by MO quantity
                consumed_qty=Decimal("0"),
            )
            db.add(mo_component)

        # Populate work_orders from BoM operations
        bom_operations = (
            db.query(BomOperation)
            .filter(BomOperation.bom_id == mo.bom_id)
            .order_by(BomOperation.sequence)
            .all()
        )
        for bom_op in bom_operations:
            wo = WorkOrder(
                mo_id=mo.id,
                sequence=bom_op.sequence,
                operation_name=bom_op.operation_name,
                work_center=bom_op.work_center,
                expected_duration_min=int(bom_op.expected_duration_min * float(shortage)),  # Scale by MO qty
            )
            db.add(wo)

    # Audit log
    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Manufacturing",
        record_type="ManufacturingOrder",
        record_id=mo.id,
        action="created",
    )

    logger.info(
        f"Auto-created MO {reference} for product '{product.name}' "
        f"qty={shortage} from SO {sales_order_id}"
    )

    return mo


def check_mo_component_shortages(
    db: Session,
    mo: ManufacturingOrder,
    current_user: User,
    ancestry_product_ids: Optional[Set[UUID]] = None,
) -> List[ManufacturingOrder]:
    """
    Check if any MO component has a shortage requiring recursive MO creation.

    Called during MO confirm. For each component:
    1. Check if to_consume > product.on_hand_qty (shortage exists)
    2. If product has procure_on_demand=True and procurement_type=manufacturing,
       create a child MO with parent_mo_id set to the current MO

    Cycle detection: tracks product IDs through ancestry. If a product appears
    twice in the chain (A → B → A), stops to prevent infinite recursion.

    Returns list of all child MOs created (direct + transitive).
    """
    if ancestry_product_ids is None:
        ancestry_product_ids = set()

    # Add current MO's finished product to ancestry chain
    ancestry_product_ids = ancestry_product_ids | {mo.finished_product_id}

    created_mos: List[ManufacturingOrder] = []

    # Load components with their products
    components = (
        db.query(MoComponent)
        .filter(MoComponent.mo_id == mo.id)
        .all()
    )

    for comp in components:
        # Lock product row for concurrency
        product = (
            db.query(Product)
            .filter(Product.id == comp.component_product_id)
            .with_for_update()
            .first()
        )

        if not product:
            logger.warning(f"Component product {comp.component_product_id} not found for MO {mo.id}")
            continue

        # Skip if not procure_on_demand or not manufacturing type
        if not product.procure_on_demand:
            continue
        if product.procurement_type != ProcurementTypeEnum.manufacturing:
            continue

        # Cycle detection: if this product is already in ancestry, skip
        if product.id in ancestry_product_ids:
            logger.warning(
                f"Cycle detected: product '{product.name}' ({product.id}) already in ancestry chain. "
                f"Skipping child MO to prevent infinite recursion."
            )
            continue

        # Calculate shortage
        shortage = comp.to_consume - product.on_hand_qty
        if shortage <= 0:
            continue

        # Create child MO
        child_mo = _create_child_manufacturing_order(
            db=db,
            product=product,
            shortage=shortage,
            parent_mo=mo,
            current_user=current_user,
        )
        created_mos.append(child_mo)

        # Recursively check the child MO's components
        grandchildren = check_mo_component_shortages(
            db=db,
            mo=child_mo,
            current_user=current_user,
            ancestry_product_ids=ancestry_product_ids,
        )
        created_mos.extend(grandchildren)

    return created_mos


def _create_child_manufacturing_order(
    db: Session,
    product: Product,
    shortage: Decimal,
    parent_mo: ManufacturingOrder,
    current_user: User,
) -> ManufacturingOrder:
    """
    Create a child Manufacturing Order for a component shortage.

    Similar to _create_manufacturing_order but sets parent_mo_id instead of
    source_sales_order_id, and inherits source_sales_order_id from parent.
    """
    reference = _get_next_mo_reference(db)

    child_mo = ManufacturingOrder(
        reference=reference,
        finished_product_id=product.id,
        bom_id=product.default_bom_id,
        quantity=shortage,
        assignee_id=current_user.id,
        status=MOStatusEnum.draft,
        auto_created=True,
        source_sales_order_id=parent_mo.source_sales_order_id,  # Inherit from parent
        parent_mo_id=parent_mo.id,
        created_by=current_user.id,
    )
    db.add(child_mo)
    db.flush()  # Get MO id

    # Populate components from BoM if present
    if child_mo.bom_id:
        bom_lines = db.query(BomLine).filter(BomLine.bom_id == child_mo.bom_id).all()
        for bom_line in bom_lines:
            mo_component = MoComponent(
                mo_id=child_mo.id,
                component_product_id=bom_line.component_product_id,
                to_consume=bom_line.qty_per_unit * shortage,
                consumed_qty=Decimal("0"),
            )
            db.add(mo_component)

        # Populate work_orders from BoM operations
        bom_operations = (
            db.query(BomOperation)
            .filter(BomOperation.bom_id == child_mo.bom_id)
            .order_by(BomOperation.sequence)
            .all()
        )
        for bom_op in bom_operations:
            wo = WorkOrder(
                mo_id=child_mo.id,
                sequence=bom_op.sequence,
                operation_name=bom_op.operation_name,
                work_center=bom_op.work_center,
                expected_duration_min=int(bom_op.expected_duration_min * float(shortage)),
            )
            db.add(wo)

    # Audit log
    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Manufacturing",
        record_type="ManufacturingOrder",
        record_id=child_mo.id,
        action="created",
    )

    logger.info(
        f"Auto-created child MO {reference} for component '{product.name}' "
        f"qty={shortage} from parent MO {parent_mo.reference}"
    )

    return child_mo
