"""
Manufacturing Order routes with state machine and terminal-only stock movements.

State machine:
  draft ──confirm──> confirmed ──start──> in_progress ──produce──> done
   │                     │                    │
   └─────────────────cancel──────────────────┘

Rules:
- BoM auto-populates components and work orders scaled to quantity when bom_id is given.
- Component consumed_qty and work order real_duration_min are editable in confirmed/in_progress.
- Produce (done): atomically adjusts stock for finished product (+qty) and each component (-consumed_qty).
  If any component adjustment would go negative, the entire transaction rolls back with HTTP 409.
- Stock movements only at done (terminal).
- edit_bom permission gates MO delete (admin-only); all other state transitions use production_entry.
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import (
    db_dependency,
    current_user_dependency,
    require_permission,
)
from app.models.bom import BOM, BomLine, BomOperation
from app.models.manufacturing import ManufacturingOrder, MoComponent, MOStatusEnum, WorkOrder
from app.models.product import Product
from app.models.sales import SalesOrder
from app.models.user import User
from app.schemas.manufacturing_order import (
    ManufacturingOrderCreateRequest,
    ManufacturingOrderUpdateRequest,
    ManufacturingOrderResponse,
    ManufacturingOrderListResponse,
    MoComponentResponse,
    WorkOrderResponse,
    ProductBrief,
    UserBrief,
)
from app.services import audit_service, stock_service
from app.services.stock_service import InsufficientStockError

router = APIRouter(prefix="/manufacturing-orders", tags=["manufacturing-orders"])


# ---------------------------------------------------------------------------
# Terminal statuses — no edits or transitions allowed
# ---------------------------------------------------------------------------

_TERMINAL = {MOStatusEnum.done, MOStatusEnum.cancelled}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_next_mo_reference(db: Session) -> str:
    """Generate next MO reference like MO-000001, MO-000002, etc."""
    from sqlalchemy import Integer
    max_num = db.query(
        func.max(
            func.cast(
                func.substr(ManufacturingOrder.reference, 4),
                Integer
            )
        )
    ).filter(ManufacturingOrder.reference.like("MO-%")).scalar()
    next_num = (max_num or 0) + 1
    return f"MO-{next_num:06d}"


def _populate_from_bom(db: Session, mo: ManufacturingOrder, bom: BOM) -> None:
    """
    Load BOM lines/operations with eager-loaded component products, then
    create MoComponents and WorkOrders on *mo* scaled to mo.quantity.
    Existing components/work_orders on the MO are deleted first.
    """
    # Eager-load bom with component products and operations
    bom = (
        db.query(BOM)
        .options(
            joinedload(BOM.bom_lines).joinedload(BomLine.component_product),
            joinedload(BOM.bom_operations),
        )
        .filter(BOM.id == bom.id)
        .first()
    )
    # Remove existing
    for comp in list(mo.components):
        db.delete(comp)
    for wo in list(mo.work_orders):
        db.delete(wo)
    db.flush()

    qty = Decimal(mo.quantity)

    for line in bom.bom_lines:
        db.add(MoComponent(
            mo_id=mo.id,
            component_product_id=line.component_product_id,
            to_consume=line.qty_per_unit * qty,
            consumed_qty=Decimal("0"),
        ))

    for op in sorted(bom.bom_operations, key=lambda o: o.sequence):
        db.add(WorkOrder(
            mo_id=mo.id,
            sequence=op.sequence,
            operation_name=op.operation_name,
            work_center=op.work_center,
            expected_duration_min=int(op.expected_duration_min * qty),
        ))


def _load_mo(db: Session, mo_id: UUID) -> ManufacturingOrder:
    mo = (
        db.query(ManufacturingOrder)
        .options(
            joinedload(ManufacturingOrder.finished_product),
            joinedload(ManufacturingOrder.assignee),
            joinedload(ManufacturingOrder.created_by_user),
            joinedload(ManufacturingOrder.source_sales_order),
            joinedload(ManufacturingOrder.components).joinedload(MoComponent.component_product),
            joinedload(ManufacturingOrder.work_orders),
        )
        .filter(ManufacturingOrder.id == mo_id)
        .first()
    )
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")
    return mo


def _build_mo_response(db: Session, mo: ManufacturingOrder) -> ManufacturingOrderResponse:
    source_so_ref = None
    if mo.source_sales_order_id and mo.source_sales_order:
        source_so_ref = mo.source_sales_order.reference

    components = []
    for comp in mo.components:
        # Get free_to_use_qty for availability check
        try:
            stock = stock_service.get_product_stock(db, comp.component_product_id)
            free_to_use = stock["free_to_use_qty"]
        except Exception:
            free_to_use = None

        components.append(MoComponentResponse(
            id=comp.id,
            component_product_id=comp.component_product_id,
            component_product_name=comp.component_product.name,
            to_consume=comp.to_consume,
            consumed_qty=comp.consumed_qty,
            batch_number=comp.batch_number,
            free_to_use_qty=free_to_use,
        ))

    work_orders = [
        WorkOrderResponse(
            id=wo.id,
            sequence=wo.sequence,
            operation_name=wo.operation_name,
            work_center=wo.work_center,
            expected_duration_min=wo.expected_duration_min,
            real_duration_min=wo.real_duration_min,
            pass_fail=wo.pass_fail,
        )
        for wo in sorted(mo.work_orders, key=lambda w: w.sequence)
    ]

    return ManufacturingOrderResponse(
        id=mo.id,
        reference=mo.reference,
        finished_product=ProductBrief(id=mo.finished_product.id, name=mo.finished_product.name),
        bom_id=mo.bom_id,
        quantity=mo.quantity,
        status=mo.status.value,
        auto_created=mo.auto_created,
        source_sales_order_id=mo.source_sales_order_id,
        source_sales_order_ref=source_so_ref,
        assignee=UserBrief(id=mo.assignee.id, name=mo.assignee.name) if mo.assignee else None,
        scheduled_date=mo.scheduled_date.isoformat() if mo.scheduled_date else None,
        components=components,
        work_orders=work_orders,
        created_at=mo.created_at,
        created_by=UserBrief(id=mo.created_by_user.id, name=mo.created_by_user.name)
        if mo.created_by_user else None,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=ManufacturingOrderResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("Manufacturing", "production_entry"))],
)
def create_manufacturing_order(
    request: ManufacturingOrderCreateRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Create a Manufacturing Order in 'draft' status.
    If bom_id is supplied, components and work orders are auto-populated from the BoM,
    scaled to the requested quantity.
    """
    # Validate finished product
    product = db.query(Product).filter(Product.id == request.finished_product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Finished product not found")

    # Validate BoM if provided
    bom = None
    if request.bom_id:
        bom = db.query(BOM).filter(BOM.id == request.bom_id).first()
        if not bom:
            raise HTTPException(status_code=404, detail="Bill of Materials not found")

    # Validate assignee if provided
    if request.assignee_id:
        assignee = db.query(User).filter(User.id == request.assignee_id).first()
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee user not found")

    # Parse scheduled_date
    scheduled = None
    if request.scheduled_date:
        try:
            scheduled = date.fromisoformat(request.scheduled_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid scheduled_date format, use YYYY-MM-DD")

    reference = _get_next_mo_reference(db)

    mo = ManufacturingOrder(
        reference=reference,
        finished_product_id=request.finished_product_id,
        bom_id=request.bom_id,
        quantity=request.quantity,
        assignee_id=request.assignee_id,
        status=MOStatusEnum.draft,
        auto_created=False,
        scheduled_date=scheduled,
        created_by=current_user.id,
    )
    db.add(mo)
    db.flush()  # get mo.id

    # Auto-populate from BoM
    if bom:
        _populate_from_bom(db, mo, bom)

    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Manufacturing",
        record_type="ManufacturingOrder",
        record_id=mo.id,
        action="created",
    )

    db.commit()
    return _build_mo_response(db, _load_mo(db, mo.id))


@router.get(
    "/",
    response_model=List[ManufacturingOrderListResponse],
    dependencies=[Depends(require_permission("Manufacturing", "view"))],
)
def list_manufacturing_orders(
    db: db_dependency,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
):
    """List Manufacturing Orders with optional search and status filter."""
    query = (
        db.query(ManufacturingOrder)
        .options(joinedload(ManufacturingOrder.finished_product))
    )

    if search:
        query = query.join(Product, Product.id == ManufacturingOrder.finished_product_id).filter(
            (ManufacturingOrder.reference.ilike(f"%{search}%"))
            | (Product.name.ilike(f"%{search}%"))
        )

    if status_filter:
        try:
            st = MOStatusEnum(status_filter)
            query = query.filter(ManufacturingOrder.status == st)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status_filter}")

    orders = query.order_by(ManufacturingOrder.created_at.desc()).all()

    return [
        ManufacturingOrderListResponse(
            id=mo.id,
            reference=mo.reference,
            finished_product_id=mo.finished_product_id,
            finished_product_name=mo.finished_product.name if mo.finished_product else "(deleted)",
            quantity=mo.quantity,
            status=mo.status.value,
            auto_created=mo.auto_created,
            source_sales_order_id=mo.source_sales_order_id,
            created_at=mo.created_at,
        )
        for mo in orders
    ]


@router.get(
    "/{mo_id}",
    response_model=ManufacturingOrderResponse,
    dependencies=[Depends(require_permission("Manufacturing", "view"))],
)
def get_manufacturing_order(mo_id: UUID, db: db_dependency):
    """Get a single Manufacturing Order with all components and work orders."""
    return _build_mo_response(db, _load_mo(db, mo_id))


@router.patch(
    "/{mo_id}",
    response_model=ManufacturingOrderResponse,
    dependencies=[Depends(require_permission("Manufacturing", "production_entry"))],
)
def update_manufacturing_order(
    mo_id: UUID,
    request: ManufacturingOrderUpdateRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Update a Manufacturing Order.

    Draft status: all header fields editable; bom_id change re-populates components/work orders.
    Confirmed / In-Progress: only components.consumed_qty and work_orders.real_duration_min/pass_fail.
    Done / Cancelled: no edits allowed (409).
    """
    mo = _load_mo(db, mo_id)

    if mo.status in _TERMINAL:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot edit: Manufacturing Order is {mo.status.value}"
        )

    update_data = request.model_dump(exclude_unset=True)

    # --- Draft-only header fields ---
    if mo.status == MOStatusEnum.draft:
        header_fields = ["finished_product_id", "bom_id", "quantity", "assignee_id", "scheduled_date"]
        bom_changed = "bom_id" in update_data or "quantity" in update_data

        if "finished_product_id" in update_data:
            prod = db.query(Product).filter(Product.id == update_data["finished_product_id"]).first()
            if not prod:
                raise HTTPException(status_code=404, detail="Finished product not found")
            mo.finished_product_id = update_data["finished_product_id"]

        if "bom_id" in update_data:
            if update_data["bom_id"] is not None:
                bom = db.query(BOM).filter(BOM.id == update_data["bom_id"]).first()
                if not bom:
                    raise HTTPException(status_code=404, detail="Bill of Materials not found")
            mo.bom_id = update_data["bom_id"]

        if "quantity" in update_data:
            mo.quantity = update_data["quantity"]

        if "assignee_id" in update_data:
            if update_data["assignee_id"] is not None:
                assignee = db.query(User).filter(User.id == update_data["assignee_id"]).first()
                if not assignee:
                    raise HTTPException(status_code=404, detail="Assignee not found")
            mo.assignee_id = update_data["assignee_id"]

        if "scheduled_date" in update_data:
            if update_data["scheduled_date"] is not None:
                try:
                    mo.scheduled_date = date.fromisoformat(update_data["scheduled_date"])
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid scheduled_date format, use YYYY-MM-DD")
            else:
                mo.scheduled_date = None

        # Re-populate BoM if bom_id or quantity changed
        if bom_changed and mo.bom_id:
            bom = db.query(BOM).filter(BOM.id == mo.bom_id).first()
            if bom:
                _populate_from_bom(db, mo, bom)

        audit_service.log_change(
            db, user_id=current_user.id, module="Manufacturing",
            record_type="ManufacturingOrder", record_id=mo.id, action="updated",
        )

    # --- Component consumed_qty (confirmed or in_progress) ---
    if "components" in update_data and update_data["components"]:
        if mo.status not in (MOStatusEnum.confirmed, MOStatusEnum.in_progress):
            raise HTTPException(
                status_code=409,
                detail="Cannot update component quantities: MO is not confirmed or in_progress"
            )
        comp_map = {comp.id: comp for comp in mo.components}
        for comp_update in update_data["components"]:
            comp = comp_map.get(comp_update["component_id"])
            if not comp:
                raise HTTPException(
                    status_code=404,
                    detail=f"Component {comp_update['component_id']} not found in this MO"
                )
            old_qty = comp.consumed_qty
            comp.consumed_qty = comp_update["consumed_qty"]
            if "batch_number" in comp_update:
                comp.batch_number = comp_update.get("batch_number")
            audit_service.log_change(
                db, user_id=current_user.id, module="Manufacturing",
                record_type="MoComponent", record_id=comp.id, action="updated",
                field_changed="consumed_qty",
                old_value=str(old_qty), new_value=str(comp.consumed_qty),
            )

    # --- Work order real_duration_min / pass_fail (confirmed or in_progress) ---
    if "work_orders" in update_data and update_data["work_orders"]:
        if mo.status not in (MOStatusEnum.confirmed, MOStatusEnum.in_progress):
            raise HTTPException(
                status_code=409,
                detail="Cannot update work orders: MO is not confirmed or in_progress"
            )
        wo_map = {wo.id: wo for wo in mo.work_orders}
        for wo_update in update_data["work_orders"]:
            wo = wo_map.get(wo_update["work_order_id"])
            if not wo:
                raise HTTPException(
                    status_code=404,
                    detail=f"Work order {wo_update['work_order_id']} not found in this MO"
                )
            if wo_update.get("real_duration_min") is not None:
                wo.real_duration_min = wo_update["real_duration_min"]
            if wo_update.get("pass_fail") is not None:
                wo.pass_fail = wo_update["pass_fail"]

    db.commit()
    return _build_mo_response(db, _load_mo(db, mo_id))


@router.post(
    "/{mo_id}/confirm",
    response_model=ManufacturingOrderResponse,
    dependencies=[Depends(require_permission("Manufacturing", "production_entry"))],
)
def confirm_manufacturing_order(
    mo_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Confirm a Manufacturing Order: draft → confirmed.
    Locks finished_product_id and bom_id from further edits.
    """
    mo = (
        db.query(ManufacturingOrder)
        .filter(ManufacturingOrder.id == mo_id)
        .with_for_update()
        .first()
    )
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    if mo.status != MOStatusEnum.draft:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot confirm: status is {mo.status.value}, must be draft"
        )

    old_status = mo.status.value
    mo.status = MOStatusEnum.confirmed

    audit_service.log_change(
        db, user_id=current_user.id, module="Manufacturing",
        record_type="ManufacturingOrder", record_id=mo.id,
        action="status_changed", field_changed="status",
        old_value=old_status, new_value=mo.status.value,
    )

    db.commit()
    return _build_mo_response(db, _load_mo(db, mo_id))


@router.post(
    "/{mo_id}/start",
    response_model=ManufacturingOrderResponse,
    dependencies=[Depends(require_permission("Manufacturing", "production_entry"))],
)
def start_manufacturing_order(
    mo_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """Start production: confirmed → in_progress."""
    mo = (
        db.query(ManufacturingOrder)
        .filter(ManufacturingOrder.id == mo_id)
        .with_for_update()
        .first()
    )
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    if mo.status != MOStatusEnum.confirmed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot start: status is {mo.status.value}, must be confirmed"
        )

    old_status = mo.status.value
    mo.status = MOStatusEnum.in_progress

    audit_service.log_change(
        db, user_id=current_user.id, module="Manufacturing",
        record_type="ManufacturingOrder", record_id=mo.id,
        action="status_changed", field_changed="status",
        old_value=old_status, new_value=mo.status.value,
    )

    db.commit()
    return _build_mo_response(db, _load_mo(db, mo_id))


@router.post(
    "/{mo_id}/produce",
    response_model=ManufacturingOrderResponse,
    dependencies=[Depends(require_permission("Manufacturing", "production_entry"))],
)
def produce_manufacturing_order(
    mo_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Mark production as done: in_progress → done.

    Terminal stock movements (all-or-nothing in one transaction):
    - Finished product stock += quantity  (mo_produce)
    - Each component stock -= consumed_qty  (mo_consume)

    If any component has insufficient stock the whole produce call fails with HTTP 409.
    """
    mo = (
        db.query(ManufacturingOrder)
        .options(
            joinedload(ManufacturingOrder.components),
        )
        .filter(ManufacturingOrder.id == mo_id)
        .with_for_update()
        .first()
    )
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    if mo.status != MOStatusEnum.in_progress:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot produce: status is {mo.status.value}, must be in_progress"
        )

    old_status = mo.status.value

    try:
        # Deduct each component first
        for comp in mo.components:
            if comp.consumed_qty > Decimal("0"):
                stock_service.adjust_stock(
                    db,
                    product_id=comp.component_product_id,
                    qty_change=-comp.consumed_qty,
                    movement_type="mo_consume",
                    reference_type="ManufacturingOrder",
                    reference_id=mo.id,
                    user_id=current_user.id,
                )

        # Add finished product
        stock_service.adjust_stock(
            db,
            product_id=mo.finished_product_id,
            qty_change=+Decimal(mo.quantity),
            movement_type="mo_produce",
            reference_type="ManufacturingOrder",
            reference_id=mo.id,
            user_id=current_user.id,
        )

    except InsufficientStockError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Insufficient stock for production: {exc}"
        )

    mo.status = MOStatusEnum.done

    audit_service.log_change(
        db, user_id=current_user.id, module="Manufacturing",
        record_type="ManufacturingOrder", record_id=mo.id,
        action="status_changed", field_changed="status",
        old_value=old_status, new_value=mo.status.value,
    )

    db.commit()
    return _build_mo_response(db, _load_mo(db, mo_id))


@router.post(
    "/{mo_id}/cancel",
    response_model=ManufacturingOrderResponse,
    dependencies=[Depends(require_permission("Manufacturing", "production_entry"))],
)
def cancel_manufacturing_order(
    mo_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Cancel a Manufacturing Order from any non-terminal status.
    Does NOT reverse any stock movements that already happened (per spec).
    """
    mo = (
        db.query(ManufacturingOrder)
        .filter(ManufacturingOrder.id == mo_id)
        .with_for_update()
        .first()
    )
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    if mo.status in _TERMINAL:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel: Manufacturing Order is already {mo.status.value}"
        )

    old_status = mo.status.value
    mo.status = MOStatusEnum.cancelled

    audit_service.log_change(
        db, user_id=current_user.id, module="Manufacturing",
        record_type="ManufacturingOrder", record_id=mo.id,
        action="status_changed", field_changed="status",
        old_value=old_status, new_value=mo.status.value,
    )

    db.commit()
    return _build_mo_response(db, _load_mo(db, mo_id))


@router.delete(
    "/{mo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("Manufacturing", "edit_bom"))],
)
def delete_manufacturing_order(
    mo_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Delete a Manufacturing Order. Admin-only. Only allowed if status is 'draft'.
    """
    mo = db.query(ManufacturingOrder).filter(ManufacturingOrder.id == mo_id).first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    if mo.status != MOStatusEnum.draft:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete: Manufacturing Order is {mo.status.value}, must be draft"
        )

    audit_service.log_change(
        db, user_id=current_user.id, module="Manufacturing",
        record_type="ManufacturingOrder", record_id=mo.id, action="deleted",
    )

    db.delete(mo)
    db.commit()
    return None
