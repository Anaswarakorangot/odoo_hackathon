from pydantic import BaseModel

class DashboardSummaryResponse(BaseModel):
    total_sales_orders: int
    pending_deliveries: int
    total_manufacturing_orders: int
    delayed_orders: int
    total_purchase_orders: int
    partial_receipts: int
