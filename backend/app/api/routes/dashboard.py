from datetime import date
from fastapi import APIRouter, Depends
from app.api.dependencies import db_dependency, require_permission
from app.models.sales import SalesOrder, SOStatusEnum
from app.models.manufacturing import ManufacturingOrder, MOStatusEnum
from app.models.purchase import PurchaseOrder, POStatusEnum
from app.schemas.dashboard import DashboardSummaryResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/summary", response_model=DashboardSummaryResponse, dependencies=[Depends(require_permission("Dashboard", "view"))])
def get_dashboard_summary(db: db_dependency):
    today = date.today()

    # Total Sales Orders
    total_sales_orders = db.query(SalesOrder).count()

    # Pending Deliveries (SOs in Confirmed or Partially Delivered)
    pending_deliveries = db.query(SalesOrder).filter(
        SalesOrder.status.in_([SOStatusEnum.confirmed, SOStatusEnum.partially_delivered])
    ).count()

    # Delayed Sales Orders (past expected_delivery_date, not yet fully_delivered/cancelled)
    delayed_sales_orders = db.query(SalesOrder).filter(
        SalesOrder.expected_delivery_date.isnot(None),
        SalesOrder.expected_delivery_date < today,
        SalesOrder.status.notin_([SOStatusEnum.fully_delivered, SOStatusEnum.cancelled])
    ).count()

    # Total Manufacturing Orders
    total_manufacturing_orders = db.query(ManufacturingOrder).count()

    # Delayed Manufacturing Orders (past scheduled_date, not yet done/cancelled)
    delayed_manufacturing_orders = db.query(ManufacturingOrder).filter(
        ManufacturingOrder.scheduled_date.isnot(None),
        ManufacturingOrder.scheduled_date < today,
        ManufacturingOrder.status.notin_([MOStatusEnum.done, MOStatusEnum.cancelled])
    ).count()

    # Total Purchase Orders
    total_purchase_orders = db.query(PurchaseOrder).count()

    # Partial Receipts (POs in Partially Received)
    partial_receipts = db.query(PurchaseOrder).filter(
        PurchaseOrder.status == POStatusEnum.partially_received
    ).count()

    # Delayed Purchase Orders (past expected_delivery_date, not yet fully_received/cancelled)
    delayed_purchase_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.expected_delivery_date.isnot(None),
        PurchaseOrder.expected_delivery_date < today,
        PurchaseOrder.status.notin_([POStatusEnum.fully_received, POStatusEnum.cancelled])
    ).count()

    return DashboardSummaryResponse(
        total_sales_orders=total_sales_orders,
        pending_deliveries=pending_deliveries,
        delayed_sales_orders=delayed_sales_orders,
        total_manufacturing_orders=total_manufacturing_orders,
        delayed_manufacturing_orders=delayed_manufacturing_orders,
        total_purchase_orders=total_purchase_orders,
        partial_receipts=partial_receipts,
        delayed_purchase_orders=delayed_purchase_orders,
    )
