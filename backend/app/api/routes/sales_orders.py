"""
Sales Order routes with state machine, field locks, and terminal-only stock movement.

State machine:
  draft ──confirm──> confirmed ──deliver──> partially_delivered ──deliver──> fully_delivered
   │                     │                          │
   └─────────cancel──────┴──────────cancel──────────┘
"""
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
from app.models.sales import SalesOrder, SalesOrderLine, SOStatusEnum
from app.models.vendor_customer import Customer
from app.models.user import User
from app.schemas.sales_order import (
    SalesOrderCreateRequest,
    SalesOrderUpdateRequest,
    SalesOrderDeliverRequest,
    SalesOrderResponse,
    SalesOrderListResponse,
    SalesOrderLineResponse,
    CustomerBrief,
    UserBrief,
)
from app.services import audit_service, stock_service
from app.services.procurement_service import check_and_trigger_procurement

router = APIRouter(prefix="/sales-orders", tags=["sales-orders"])


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def get_next_so_reference(db: Session) -> str:
    """Generate next SO reference like SO-000001, SO-000002, etc."""
    from sqlalchemy import Integer
    max_num = db.query(
        func.max(
            func.cast(
                func.substr(SalesOrder.reference, 4),
                Integer
            )
        )
    ).filter(SalesOrder.reference.like("SO-%")).scalar()

    next_num = (max_num or 0) + 1
    return f"SO-{next_num:06d}"


def build_line_response(line: SalesOrderLine) -> SalesOrderLineResponse:
    """Build response for a single sales order line."""
    return SalesOrderLineResponse(
        id=line.id,
        product_id=line.product_id,
        product_name=line.product.name,
        ordered_qty=line.ordered_qty,
        delivered_qty=line.delivered_qty,
        sales_price=line.sales_price,
        line_total=stock_service.get_sales_order_line_total(line),
    )


def build_so_response(so: SalesOrder) -> SalesOrderResponse:
    """Build full response for a sales order."""
    lines = [build_line_response(line) for line in so.lines]
    total_amount = sum(line.line_total for line in lines)

    return SalesOrderResponse(
        id=so.id,
        reference=so.reference,
        customer=CustomerBrief(
            id=so.customer.id,
            name=so.customer.name,
            address=so.customer.address,
        ),
        customer_address=so.customer_address,
        salesperson=UserBrief(id=so.salesperson.id, name=so.salesperson.name)
        if so.salesperson
        else None,
        status=so.status.value,
        lines=lines,
        total_amount=total_amount,
        created_at=so.created_at,
        created_by=UserBrief(id=so.created_by_user.id, name=so.created_by_user.name)
        if so.created_by_user
        else None,
    )


def is_field_readonly(status: SOStatusEnum, field_name: str) -> bool:
    """
    Check if a field is readonly based on current status.

    Draft: all fields editable
    Confirmed/Partially Delivered: customer_id, customer_address, lines.product_id,
                                   lines.ordered_qty are readonly
    Fully Delivered/Cancelled: all fields readonly
    """
    if status == SOStatusEnum.draft:
        return False

    if status in (SOStatusEnum.fully_delivered, SOStatusEnum.cancelled):
        return True

    # Confirmed or partially_delivered
    readonly_fields = {
        "customer_id", "customer_address",
        "lines.product_id", "lines.ordered_qty"
    }
    return field_name in readonly_fields


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@router.post(
    "/",
    response_model=SalesOrderResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("Sales", "create"))],
)
def create_sales_order(
    request: SalesOrderCreateRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """Create a new sales order."""
    # Validate customer exists
    customer = db.query(Customer).filter(Customer.id == request.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Validate salesperson if provided
    salesperson_id = request.salesperson_id or current_user.id
    if request.salesperson_id:
        salesperson = db.query(User).filter(User.id == request.salesperson_id).first()
        if not salesperson:
            raise HTTPException(status_code=404, detail="Salesperson not found")

    # Generate reference
    reference = get_next_so_reference(db)

    # Create sales order with customer address snapshot
    so = SalesOrder(
        reference=reference,
        customer_id=request.customer_id,
        customer_address=customer.address,  # Snapshot at order-create time
        salesperson_id=salesperson_id,
        status=SOStatusEnum.draft,
        created_by=current_user.id,
    )
    db.add(so)
    db.flush()  # Get SO id

    # Create line items
    for item in request.line_items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Product {item.product_id} not found"
            )

        line = SalesOrderLine(
            sales_order_id=so.id,
            product_id=item.product_id,
            ordered_qty=item.ordered_qty,
            delivered_qty=Decimal("0"),
            sales_price=product.sales_price,  # Snapshot at line-add time
        )
        db.add(line)

    # Audit log
    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Sales",
        record_type="SalesOrder",
        record_id=so.id,
        action="created",
    )

    db.commit()
    db.refresh(so)

    # Reload with relationships
    so = (
        db.query(SalesOrder)
        .options(
            joinedload(SalesOrder.customer),
            joinedload(SalesOrder.salesperson),
            joinedload(SalesOrder.created_by_user),
            joinedload(SalesOrder.lines).joinedload(SalesOrderLine.product),
        )
        .filter(SalesOrder.id == so.id)
        .first()
    )

    return build_so_response(so)


@router.get(
    "/",
    response_model=List[SalesOrderListResponse],
    dependencies=[Depends(require_permission("Sales", "view"))],
)
def list_sales_orders(
    db: db_dependency,
    search: Optional[str] = None,
    status: Optional[str] = None,
):
    """List sales orders with optional search and status filter."""
    query = (
        db.query(SalesOrder)
        .options(
            joinedload(SalesOrder.customer),
            joinedload(SalesOrder.lines).joinedload(SalesOrderLine.product),
        )
    )

    if search:
        query = query.join(Customer).filter(
            (SalesOrder.reference.ilike(f"%{search}%"))
            | (Customer.name.ilike(f"%{search}%"))
        )

    if status:
        try:
            status_enum = SOStatusEnum(status)
            query = query.filter(SalesOrder.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    orders = query.order_by(SalesOrder.created_at.desc()).all()

    result = []
    for so in orders:
        lines = [build_line_response(line) for line in so.lines]
        total_amount = sum(line.line_total for line in lines)
        result.append(
            SalesOrderListResponse(
                id=so.id,
                reference=so.reference,
                customer_name=so.customer.name,
                status=so.status.value,
                total_amount=total_amount,
                created_at=so.created_at,
            )
        )

    return result


@router.get(
    "/{so_id}",
    response_model=SalesOrderResponse,
    dependencies=[Depends(require_permission("Sales", "view"))],
)
def get_sales_order(so_id: UUID, db: db_dependency):
    """Get a specific sales order by ID."""
    so = (
        db.query(SalesOrder)
        .options(
            joinedload(SalesOrder.customer),
            joinedload(SalesOrder.salesperson),
            joinedload(SalesOrder.created_by_user),
            joinedload(SalesOrder.lines).joinedload(SalesOrderLine.product),
        )
        .filter(SalesOrder.id == so_id)
        .first()
    )

    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")

    return build_so_response(so)


@router.post(
    "/{so_id}/confirm",
    response_model=SalesOrderResponse,
    dependencies=[Depends(require_permission("Sales", "approve"))],
)
def confirm_sales_order(
    so_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Confirm a sales order. Admin-only (requires 'approve' permission).

    - Current status must be 'draft'
    - Locks the SO for concurrent confirm protection
    - Sets status to 'confirmed'
    - Locks customer_id, customer_address for future edits
    - May trigger procurement for MTO products (if shortage detected)
    """
    # Lock the SO row
    so = (
        db.query(SalesOrder)
        .filter(SalesOrder.id == so_id)
        .with_for_update()
        .first()
    )

    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")

    if so.status != SOStatusEnum.draft:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot confirm: status is {so.status.value}, must be draft"
        )

    old_status = so.status.value

    # Set status to confirmed (must happen before procurement to link source_sales_order_id)
    so.status = SOStatusEnum.confirmed

    # Trigger procurement for each line if needed (EC-4)
    # This happens in the same transaction - if procurement fails, SO confirm rolls back
    for line in so.lines:
        try:
            auto_order = check_and_trigger_procurement(
                db=db,
                so_line=line,
                sales_order_id=so.id,
                current_user=current_user,
            )
            # auto_order is already audited by check_and_trigger_procurement
        except ValueError as e:
            # Convert procurement config errors to clean 422
            raise HTTPException(status_code=422, detail=str(e))

    # Audit log
    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Sales",
        record_type="SalesOrder",
        record_id=so.id,
        action="status_changed",
        field_changed="status",
        old_value=old_status,
        new_value=so.status.value,
    )

    db.commit()

    # Reload with relationships
    so = (
        db.query(SalesOrder)
        .options(
            joinedload(SalesOrder.customer),
            joinedload(SalesOrder.salesperson),
            joinedload(SalesOrder.created_by_user),
            joinedload(SalesOrder.lines).joinedload(SalesOrderLine.product),
        )
        .filter(SalesOrder.id == so_id)
        .first()
    )

    return build_so_response(so)


@router.patch(
    "/{so_id}",
    response_model=SalesOrderResponse,
    dependencies=[Depends(require_permission("Sales", "edit"))],
)
def update_sales_order(
    so_id: UUID,
    request: SalesOrderUpdateRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Update a sales order. Field availability depends on status:

    - Draft: all fields editable
    - Confirmed/Partially Delivered: only salesperson_id and line.delivered_qty editable
    - Fully Delivered/Cancelled: nothing editable (returns 409)
    """
    so = (
        db.query(SalesOrder)
        .options(joinedload(SalesOrder.lines))
        .filter(SalesOrder.id == so_id)
        .first()
    )

    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")

    # Fully delivered or cancelled - no edits allowed
    if so.status in (SOStatusEnum.fully_delivered, SOStatusEnum.cancelled):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot edit: order is {so.status.value}"
        )

    update_data = request.model_dump(exclude_unset=True)

    # Check field locks based on status
    for field_name in update_data.keys():
        if field_name == "lines":
            continue  # Handle lines separately
        if is_field_readonly(so.status, field_name):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot edit {field_name}: field is locked in status {so.status.value}"
            )

    # Apply simple field updates
    for field_name in ["customer_id", "customer_address", "salesperson_id"]:
        if field_name in update_data:
            old_value = getattr(so, field_name)
            new_value = update_data[field_name]
            if old_value != new_value:
                setattr(so, field_name, new_value)
                audit_service.log_change(
                    db,
                    user_id=current_user.id,
                    module="Sales",
                    record_type="SalesOrder",
                    record_id=so.id,
                    action="updated",
                    field_changed=field_name,
                    old_value=str(old_value) if old_value else None,
                    new_value=str(new_value) if new_value else None,
                )

    # Handle lines update (only in draft status for full edit)
    if "lines" in update_data and update_data["lines"] is not None:
        if so.status != SOStatusEnum.draft:
            raise HTTPException(
                status_code=409,
                detail="Cannot modify lines: order is not in draft status"
            )

        # Delete existing lines and create new ones
        for line in so.lines:
            db.delete(line)

        for line_data in update_data["lines"]:
            product = db.query(Product).filter(Product.id == line_data["product_id"]).first()
            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product {line_data['product_id']} not found"
                )

            new_line = SalesOrderLine(
                sales_order_id=so.id,
                product_id=line_data["product_id"],
                ordered_qty=line_data["ordered_qty"],
                delivered_qty=Decimal("0"),
                sales_price=product.sales_price,
            )
            db.add(new_line)

    db.commit()

    # Reload with relationships
    so = (
        db.query(SalesOrder)
        .options(
            joinedload(SalesOrder.customer),
            joinedload(SalesOrder.salesperson),
            joinedload(SalesOrder.created_by_user),
            joinedload(SalesOrder.lines).joinedload(SalesOrderLine.product),
        )
        .filter(SalesOrder.id == so_id)
        .first()
    )

    return build_so_response(so)


@router.post(
    "/{so_id}/deliver",
    response_model=SalesOrderResponse,
    dependencies=[Depends(require_permission("Sales", "edit"))],
)
def deliver_sales_order(
    so_id: UUID,
    request: SalesOrderDeliverRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Deliver items from a sales order. This is the key state-transition endpoint.

    - Status must be 'confirmed' or 'partially_delivered'
    - Updates delivered_qty for each line (accumulates, doesn't replace)
    - If ALL lines fully delivered: status -> 'fully_delivered', stock moves
    - Else: status -> 'partially_delivered'

    Stock movement happens ONLY at terminal status (fully_delivered).
    """
    # Lock the SO
    so = (
        db.query(SalesOrder)
        .options(joinedload(SalesOrder.lines))
        .filter(SalesOrder.id == so_id)
        .with_for_update()
        .first()
    )

    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")

    if so.status not in (SOStatusEnum.confirmed, SOStatusEnum.partially_delivered):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot deliver: status is {so.status.value}, must be confirmed or partially_delivered"
        )

    old_status = so.status.value

    # Build a map of line_id -> line for quick lookup
    line_map = {line.id: line for line in so.lines}

    # Track which lines just became fully delivered
    newly_completed_lines = []

    for delivery in request.lines:
        line = line_map.get(delivery.line_id)
        if not line:
            raise HTTPException(
                status_code=404,
                detail=f"Line {delivery.line_id} not found in this order"
            )

        # Check if this would exceed ordered_qty
        was_complete = line.delivered_qty >= line.ordered_qty
        new_delivered = line.delivered_qty + delivery.delivered_qty

        if new_delivered > line.ordered_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot deliver {delivery.delivered_qty} for line {delivery.line_id}: "
                       f"would exceed ordered qty ({line.ordered_qty})"
            )

        old_delivered = line.delivered_qty
        line.delivered_qty = new_delivered

        # Audit the delivery qty change
        audit_service.log_change(
            db,
            user_id=current_user.id,
            module="Sales",
            record_type="SalesOrderLine",
            record_id=line.id,
            action="updated",
            field_changed="delivered_qty",
            old_value=str(old_delivered),
            new_value=str(new_delivered),
        )

        # Check if this line just became fully delivered
        is_now_complete = new_delivered >= line.ordered_qty
        if is_now_complete and not was_complete:
            newly_completed_lines.append(line)

    # Check if ALL lines are now fully delivered
    all_complete = all(line.delivered_qty >= line.ordered_qty for line in so.lines)

    if all_complete:
        so.status = SOStatusEnum.fully_delivered

        # Stock movement happens HERE (terminal status only)
        # Move stock for lines that just completed
        for line in newly_completed_lines:
            stock_service.adjust_stock(
                db,
                product_id=line.product_id,
                qty_change=-line.ordered_qty,  # Negative = stock leaving
                movement_type="so_delivery",
                reference_type="SalesOrder",
                reference_id=so.id,
                user_id=current_user.id,
            )
    else:
        so.status = SOStatusEnum.partially_delivered

    # Audit status change if it changed
    if so.status.value != old_status:
        audit_service.log_change(
            db,
            user_id=current_user.id,
            module="Sales",
            record_type="SalesOrder",
            record_id=so.id,
            action="status_changed",
            field_changed="status",
            old_value=old_status,
            new_value=so.status.value,
        )

    db.commit()

    # Reload with relationships
    so = (
        db.query(SalesOrder)
        .options(
            joinedload(SalesOrder.customer),
            joinedload(SalesOrder.salesperson),
            joinedload(SalesOrder.created_by_user),
            joinedload(SalesOrder.lines).joinedload(SalesOrderLine.product),
        )
        .filter(SalesOrder.id == so_id)
        .first()
    )

    return build_so_response(so)


@router.post(
    "/{so_id}/cancel",
    response_model=SalesOrderResponse,
    dependencies=[Depends(require_permission("Sales", "edit"))],
)
def cancel_sales_order(
    so_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Cancel a sales order.

    - Can cancel from draft, confirmed, or partially_delivered
    - Does NOT reverse any stock movements that already happened
    - Does NOT cascade-cancel auto-triggered PO/MO (they stay as future stock)
    """
    so = (
        db.query(SalesOrder)
        .filter(SalesOrder.id == so_id)
        .with_for_update()
        .first()
    )

    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")

    if so.status in (SOStatusEnum.fully_delivered, SOStatusEnum.cancelled):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel: order is already {so.status.value}"
        )

    old_status = so.status.value
    so.status = SOStatusEnum.cancelled

    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Sales",
        record_type="SalesOrder",
        record_id=so.id,
        action="status_changed",
        field_changed="status",
        old_value=old_status,
        new_value=so.status.value,
    )

    db.commit()

    # Reload with relationships
    so = (
        db.query(SalesOrder)
        .options(
            joinedload(SalesOrder.customer),
            joinedload(SalesOrder.salesperson),
            joinedload(SalesOrder.created_by_user),
            joinedload(SalesOrder.lines).joinedload(SalesOrderLine.product),
        )
        .filter(SalesOrder.id == so_id)
        .first()
    )

    return build_so_response(so)


@router.delete(
    "/{so_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("Sales", "delete"))],
)
def delete_sales_order(
    so_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Delete a sales order. Only allowed if status is 'draft'.
    """
    so = db.query(SalesOrder).filter(SalesOrder.id == so_id).first()

    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")

    if so.status != SOStatusEnum.draft:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete: order is {so.status.value}, must be draft"
        )

    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="Sales",
        record_type="SalesOrder",
        record_id=so.id,
        action="deleted",
    )

    db.delete(so)
    db.commit()
    return None
