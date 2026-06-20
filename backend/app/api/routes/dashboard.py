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
    # Total Sales Orders
    total_sales_orders = db.query(SalesOrder).count()
    
    # Pending Deliveries (SOs in Confirmed or Partially Delivered)
    pending_deliveries = db.query(SalesOrder).filter(
        SalesOrder.status.in_([SOStatusEnum.confirmed, SOStatusEnum.partially_delivered])
    ).count()
    
    # Total Manufacturing Orders
    total_manufacturing_orders = db.query(ManufacturingOrder).count()
    
    # Delayed Orders (MOs past scheduled_date and not yet Done/Cancelled)
    today = date.today()
    delayed_orders = db.query(ManufacturingOrder).filter(
        ManufacturingOrder.scheduled_date < today,
        ManufacturingOrder.status.notin_([MOStatusEnum.done, MOStatusEnum.cancelled])
    ).count()
    
    # Total Purchase Orders
    total_purchase_orders = db.query(PurchaseOrder).count()
    
    # Partial Receipts (POs in Partially Received)
    partial_receipts = db.query(PurchaseOrder).filter(
        PurchaseOrder.status == POStatusEnum.partially_received
    ).count()
    
    return DashboardSummaryResponse(
        total_sales_orders=total_sales_orders,
        pending_deliveries=pending_deliveries,
        total_manufacturing_orders=total_manufacturing_orders,
        delayed_orders=delayed_orders,
        total_purchase_orders=total_purchase_orders,
        partial_receipts=partial_receipts
    )
