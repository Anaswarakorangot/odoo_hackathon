from pydantic import BaseModel

class DashboardSummaryResponse(BaseModel):
    total_sales_orders: int
    pending_deliveries: int
    delayed_sales_orders: int  # SOs past expected_delivery_date
    total_manufacturing_orders: int
    delayed_manufacturing_orders: int  # MOs past scheduled_date (renamed for clarity)
    total_purchase_orders: int
    partial_receipts: int
    delayed_purchase_orders: int  # POs past expected_delivery_date
