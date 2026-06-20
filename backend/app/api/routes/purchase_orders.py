"""
Purchase Order routes with state machine, field locks, and terminal-only stock movement.

State machine:
  draft ──confirm──> confirmed ──receive──> partially_received ──receive──> fully_received
   │                     │                          │
   └─────────cancel──────┴──────────cancel──────────┘

This mirrors Sales Orders exactly, with:
- Vendor instead of Customer
- received_qty instead of delivered_qty
- Stock movement is POSITIVE (adding stock on receipt)
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
from app.models.product import Product
from app.models.purchase import PurchaseOrder, PurchaseOrderLine, POStatusEnum
from app.models.sales import SalesOrder
from app.models.vendor_customer import Vendor
from app.models.user import User
from app.schemas.purchase_order import (
    PurchaseOrderCreateRequest,
    PurchaseOrderUpdateRequest,
    PurchaseOrderReceiveRequest,
    PurchaseOrderResponse,
    PurchaseOrderListResponse,
    PurchaseOrderLineResponse,
    VendorBrief,
    UserBrief,
)
from app.services import audit_service, stock_service

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def get_next_po_reference(db: Session) -> str:
    """Generate next PO reference like PO-000001, PO-000002, etc."""
    count = db.query(func.count(PurchaseOrder.id)).scalar() or 0
    next_num = count + 1
    return f"PO-{next_num:06d}"


def build_line_response(line: PurchaseOrderLine) -> PurchaseOrderLineResponse:
    """Build response for a single purchase order line."""
    return PurchaseOrderLineResponse(
        id=line.id,
        product_id=line.product_id,
        product_name=line.product.name,
        ordered_qty=line.ordered_qty,
        received_qty=line.received_qty,
        cost_price=line.cost_price,
        line_total=stock_service.get_purchase_order_line_total(line),
    )


def build_po_response(po: PurchaseOrder) -> PurchaseOrderResponse:
    """Build full response for a purchase order."""
    lines = [build_line_response(line) for line in po.lines]
    total_amount = sum(line.line_total for line in lines)

    # Get source SO reference if auto-created
    source_so_ref = None
    if po.source_sales_order_id and po.source_sales_order:
        source_so_ref = po.source_sales_order.reference

    return PurchaseOrderResponse(
        id=po.id,
        reference=po.reference,
        vendor=VendorBrief(
            id=po.vendor.id,
            name=po.vendor.name,
            address=po.vendor.address,
        ),
        vendor_address=po.vendor_address,
        responsible_person=UserBrief(id=po.responsible_person.id, name=po.responsible_person.name)
        if po.responsible_person
        else None,
        status=po.status.value,
        expected_delivery_date=po.expected_delivery_date.isoformat()
        if po.expected_delivery_date
        else None,
        auto_created=po.auto_created,
        source_sales_order_id=po.source_sales_order_id,
        source_sales_order_ref=source_so_ref,
        lines=lines,
        total_amount=total_amount,
        created_at=po.created_at,
        created_by=UserBrief(id=po.created_by_user.id, name=po.created_by_user.name)
        if po.created_by_user
        else None,
    )


def is_field_readonly(status: POStatusEnum, field_name: str) -> bool:
    """
    Check if a field is readonly based on current status.

    Draft: all fields editable
    Confirmed/Partially Received: vendor_id, vendor_address, lines.product_id,
                                  lines.ordered_qty are readonly
    Fully Received/Cancelled: all fields readonly
    """
    if status == POStatusEnum.draft:
        return False

    if status in (POStatusEnum.fully_received, POStatusEnum.cancelled):
        return True

    # Confirmed or partially_received
    readonly_fields = {
        "vendor_id", "vendor_address",
        "lines.product_id", "lines.ordered_qty"
    }
    return field_name in readonly_fields


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@router.post(
    "/",
    response_model=PurchaseOrderResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("Purchase", "create"))],
)
def create_purchase_order(
    request: PurchaseOrderCreateRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """Create a new purchase order."""
    # Validate vendor exists
    vendor = db.query(Vendor).filter(Vendor.id == request.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Validate responsible person if provided
    responsible_person_id = request.responsible_person_id or current_user.id
    if request.responsible_person_id:
        responsible_person = db.query(User).filter(User.id == request.responsible_person_id).first()
        if not responsible_person:
            raise HTTPException(status_code=404, detail="Responsible person not found")

    # Generate reference
    reference = get_next_po_reference(db)

    # Parse expected_delivery_date if provided
    expected_date = None
    if request.expected_delivery_date:
        try:
            expected_date = date.fromisoformat(request.expected_delivery_date)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid expected_delivery_date format, use YYYY-MM-DD"
            )

    # Create purchase order with vendor address snapshot
    po = PurchaseOrder(
        reference=reference,
        vendor_id=request.vendor_id,
        vendor_address=vendor.address,  # Snapshot at order-create time
        responsible_person_id=responsible_person_id,
        expected_delivery_date=expected_date,
        status=POStatusEnum.draft,
        auto_created=False,
        created_by=current_user.id,
    )
    db.add(po)
    db.flush()  # Get PO id

    # Create line items
    for item in request.line_items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Product {item.product_id} not found"
            )

        line = PurchaseOrderLine(
            purchase_order_id=po.id,
            product_id=item.product_id,
            ordered_qty=item.ordered_qty,
            received_qty=Decimal("0"),
            cost_price=product.cost_price,  # Snapshot at line-add time
        )
        db.add(line)

    # Audit log
    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Purchase",
        record_type="PurchaseOrder",
        record_id=po.id,
        action="created",
    )

    db.commit()
    db.refresh(po)

    # Reload with relationships
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.responsible_person),
            joinedload(PurchaseOrder.created_by_user),
            joinedload(PurchaseOrder.source_sales_order),
            joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.product),
        )
        .filter(PurchaseOrder.id == po.id)
        .first()
    )

    return build_po_response(po)


@router.get(
    "/",
    response_model=List[PurchaseOrderListResponse],
    dependencies=[Depends(require_permission("Purchase", "view"))],
)
def list_purchase_orders(
    db: db_dependency,
    search: Optional[str] = None,
    status: Optional[str] = None,
):
    """List purchase orders with optional search and status filter."""
    query = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.product),
        )
    )

    if search:
        query = query.join(Vendor).filter(
            (PurchaseOrder.reference.ilike(f"%{search}%"))
            | (Vendor.name.ilike(f"%{search}%"))
        )

    if status:
        try:
            status_enum = POStatusEnum(status)
            query = query.filter(PurchaseOrder.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    orders = query.order_by(PurchaseOrder.created_at.desc()).all()

    result = []
    for po in orders:
        lines = [build_line_response(line) for line in po.lines]
        total_amount = sum(line.line_total for line in lines)
        result.append(
            PurchaseOrderListResponse(
                id=po.id,
                reference=po.reference,
                vendor_name=po.vendor.name,
                status=po.status.value,
                expected_delivery_date=po.expected_delivery_date.isoformat()
                if po.expected_delivery_date
                else None,
                auto_created=po.auto_created,
                total_amount=total_amount,
                created_at=po.created_at,
            )
        )

    return result


@router.get(
    "/{po_id}",
    response_model=PurchaseOrderResponse,
    dependencies=[Depends(require_permission("Purchase", "view"))],
)
def get_purchase_order(po_id: UUID, db: db_dependency):
    """Get a specific purchase order by ID."""
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.responsible_person),
            joinedload(PurchaseOrder.created_by_user),
            joinedload(PurchaseOrder.source_sales_order),
            joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.product),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )

    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    return build_po_response(po)


@router.post(
    "/{po_id}/confirm",
    response_model=PurchaseOrderResponse,
    dependencies=[Depends(require_permission("Purchase", "approve"))],
)
def confirm_purchase_order(
    po_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Confirm a purchase order. Admin-only (requires 'approve' permission).

    - Current status must be 'draft'
    - Locks the PO for concurrent confirm protection
    - Sets status to 'confirmed'
    - Locks vendor_id, vendor_address for future edits
    """
    # Lock the PO row
    po = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == po_id)
        .with_for_update()
        .first()
    )

    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status != POStatusEnum.draft:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot confirm: status is {po.status.value}, must be draft"
        )

    old_status = po.status.value

    # Set status to confirmed
    po.status = POStatusEnum.confirmed

    # Audit log
    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Purchase",
        record_type="PurchaseOrder",
        record_id=po.id,
        action="status_changed",
        field_changed="status",
        old_value=old_status,
        new_value=po.status.value,
    )

    db.commit()

    # Reload with relationships
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.responsible_person),
            joinedload(PurchaseOrder.created_by_user),
            joinedload(PurchaseOrder.source_sales_order),
            joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.product),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )

    return build_po_response(po)


@router.patch(
    "/{po_id}",
    response_model=PurchaseOrderResponse,
    dependencies=[Depends(require_permission("Purchase", "edit"))],
)
def update_purchase_order(
    po_id: UUID,
    request: PurchaseOrderUpdateRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Update a purchase order. Field availability depends on status:

    - Draft: all fields editable
    - Confirmed/Partially Received: only responsible_person_id editable
    - Fully Received/Cancelled: nothing editable (returns 409)
    """
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.lines))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )

    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    # Fully received or cancelled - no edits allowed
    if po.status in (POStatusEnum.fully_received, POStatusEnum.cancelled):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot edit: order is {po.status.value}"
        )

    update_data = request.model_dump(exclude_unset=True)

    # Check field locks based on status
    for field_name in update_data.keys():
        if field_name == "lines":
            continue  # Handle lines separately
        if is_field_readonly(po.status, field_name):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot edit {field_name}: field is locked in status {po.status.value}"
            )

    # Apply simple field updates
    for field_name in ["vendor_id", "vendor_address", "responsible_person_id"]:
        if field_name in update_data:
            old_value = getattr(po, field_name)
            new_value = update_data[field_name]
            if old_value != new_value:
                setattr(po, field_name, new_value)
                audit_service.log_change(
                    db,
                    user_id=current_user.id,
                    module="Purchase",
                    record_type="PurchaseOrder",
                    record_id=po.id,
                    action="updated",
                    field_changed=field_name,
                    old_value=str(old_value) if old_value else None,
                    new_value=str(new_value) if new_value else None,
                )

    # Handle expected_delivery_date
    if "expected_delivery_date" in update_data:
        old_date = po.expected_delivery_date
        new_date_str = update_data["expected_delivery_date"]
        new_date = None
        if new_date_str:
            try:
                new_date = date.fromisoformat(new_date_str)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid expected_delivery_date format, use YYYY-MM-DD"
                )
        if old_date != new_date:
            po.expected_delivery_date = new_date
            audit_service.log_change(
                db,
                user_id=current_user.id,
                module="Purchase",
                record_type="PurchaseOrder",
                record_id=po.id,
                action="updated",
                field_changed="expected_delivery_date",
                old_value=old_date.isoformat() if old_date else None,
                new_value=new_date.isoformat() if new_date else None,
            )

    # Handle lines update (only in draft status for full edit)
    if "lines" in update_data and update_data["lines"] is not None:
        if po.status != POStatusEnum.draft:
            raise HTTPException(
                status_code=409,
                detail="Cannot modify lines: order is not in draft status"
            )

        # Delete existing lines and create new ones
        for line in po.lines:
            db.delete(line)

        for line_data in update_data["lines"]:
            product = db.query(Product).filter(Product.id == line_data["product_id"]).first()
            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product {line_data['product_id']} not found"
                )

            new_line = PurchaseOrderLine(
                purchase_order_id=po.id,
                product_id=line_data["product_id"],
                ordered_qty=line_data["ordered_qty"],
                received_qty=Decimal("0"),
                cost_price=product.cost_price,
            )
            db.add(new_line)

    db.commit()

    # Reload with relationships
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.responsible_person),
            joinedload(PurchaseOrder.created_by_user),
            joinedload(PurchaseOrder.source_sales_order),
            joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.product),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )

    return build_po_response(po)


@router.post(
    "/{po_id}/receive",
    response_model=PurchaseOrderResponse,
    dependencies=[Depends(require_permission("Purchase", "edit"))],
)
def receive_purchase_order(
    po_id: UUID,
    request: PurchaseOrderReceiveRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Receive items from a purchase order. This is the key state-transition endpoint.

    - Status must be 'confirmed' or 'partially_received'
    - Updates received_qty for each line (accumulates, doesn't replace)
    - If ALL lines fully received: status -> 'fully_received', stock moves IN
    - Else: status -> 'partially_received'

    Stock movement happens ONLY at terminal status (fully_received).
    Stock is ADDED (positive qty_change) since we're receiving goods.
    """
    # Lock the PO
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.lines))
        .filter(PurchaseOrder.id == po_id)
        .with_for_update()
        .first()
    )

    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status not in (POStatusEnum.confirmed, POStatusEnum.partially_received):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot receive: status is {po.status.value}, must be confirmed or partially_received"
        )

    old_status = po.status.value

    # Build a map of line_id -> line for quick lookup
    line_map = {line.id: line for line in po.lines}

    # Track which lines just became fully received
    newly_completed_lines = []

    for receipt in request.lines:
        line = line_map.get(receipt.line_id)
        if not line:
            raise HTTPException(
                status_code=404,
                detail=f"Line {receipt.line_id} not found in this order"
            )

        # Check if this would exceed ordered_qty
        was_complete = line.received_qty >= line.ordered_qty
        new_received = line.received_qty + receipt.received_qty

        if new_received > line.ordered_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot receive {receipt.received_qty} for line {receipt.line_id}: "
                       f"would exceed ordered qty ({line.ordered_qty})"
            )

        old_received = line.received_qty
        line.received_qty = new_received

        # Audit the received qty change
        audit_service.log_change(
            db,
            user_id=current_user.id,
            module="Purchase",
            record_type="PurchaseOrderLine",
            record_id=line.id,
            action="updated",
            field_changed="received_qty",
            old_value=str(old_received),
            new_value=str(new_received),
        )

        # Check if this line just became fully received
        is_now_complete = new_received >= line.ordered_qty
        if is_now_complete and not was_complete:
            newly_completed_lines.append(line)

    # Check if ALL lines are now fully received
    all_complete = all(line.received_qty >= line.ordered_qty for line in po.lines)

    if all_complete:
        po.status = POStatusEnum.fully_received

        # Stock movement happens HERE (terminal status only)
        # Move stock IN for lines that just completed
        for line in newly_completed_lines:
            stock_service.adjust_stock(
                db,
                product_id=line.product_id,
                qty_change=+line.ordered_qty,  # Positive = stock coming IN
                movement_type="po_receipt",
                reference_type="PurchaseOrder",
                reference_id=po.id,
                user_id=current_user.id,
            )
    else:
        po.status = POStatusEnum.partially_received

    # Audit status change if it changed
    if po.status.value != old_status:
        audit_service.log_change(
            db,
            user_id=current_user.id,
            module="Purchase",
            record_type="PurchaseOrder",
            record_id=po.id,
            action="status_changed",
            field_changed="status",
            old_value=old_status,
            new_value=po.status.value,
        )

    db.commit()

    # Reload with relationships
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.responsible_person),
            joinedload(PurchaseOrder.created_by_user),
            joinedload(PurchaseOrder.source_sales_order),
            joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.product),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )

    return build_po_response(po)


@router.post(
    "/{po_id}/cancel",
    response_model=PurchaseOrderResponse,
    dependencies=[Depends(require_permission("Purchase", "edit"))],
)
def cancel_purchase_order(
    po_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Cancel a purchase order.

    - Can cancel from draft, confirmed, or partially_received
    - Does NOT reverse any stock movements that already happened
    """
    po = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == po_id)
        .with_for_update()
        .first()
    )

    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status in (POStatusEnum.fully_received, POStatusEnum.cancelled):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel: order is already {po.status.value}"
        )

    old_status = po.status.value
    po.status = POStatusEnum.cancelled

    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Purchase",
        record_type="PurchaseOrder",
        record_id=po.id,
        action="status_changed",
        field_changed="status",
        old_value=old_status,
        new_value=po.status.value,
    )

    db.commit()

    # Reload with relationships
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.responsible_person),
            joinedload(PurchaseOrder.created_by_user),
            joinedload(PurchaseOrder.source_sales_order),
            joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.product),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )

    return build_po_response(po)


@router.delete(
    "/{po_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("Purchase", "delete"))],
)
def delete_purchase_order(
    po_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Delete a purchase order. Only allowed if status is 'draft'.
    """
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()

    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status != POStatusEnum.draft:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete: order is {po.status.value}, must be draft"
        )

    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Purchase",
        record_type="PurchaseOrder",
        record_id=po.id,
        action="deleted",
    )

    db.delete(po)
    db.commit()
    return None
