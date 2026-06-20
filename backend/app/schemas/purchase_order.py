"""
Purchase Order schemas for request/response validation.
"""
from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PurchaseOrderLineCreate(BaseModel):
    """Line item for creating a purchase order."""
    product_id: UUID
    ordered_qty: Decimal = Field(gt=0)


class PurchaseOrderLineUpdate(BaseModel):
    """Line item for updating a purchase order (in draft status)."""
    id: Optional[UUID] = None  # None for new lines
    product_id: UUID
    ordered_qty: Decimal = Field(gt=0)


class PurchaseOrderLineReceive(BaseModel):
    """Line item for receive action."""
    line_id: UUID
    received_qty: Decimal = Field(ge=0)
    batch_number: Optional[str] = None  # Optional for recall traceability


class PurchaseOrderCreateRequest(BaseModel):
    """Request to create a new purchase order."""
    vendor_id: UUID
    responsible_person_id: Optional[UUID] = None
    expected_delivery_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    line_items: List[PurchaseOrderLineCreate] = Field(min_length=1)


class PurchaseOrderUpdateRequest(BaseModel):
    """Request to update a purchase order (field availability depends on status)."""
    vendor_id: Optional[UUID] = None
    vendor_address: Optional[str] = None
    responsible_person_id: Optional[UUID] = None
    expected_delivery_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    lines: Optional[List[PurchaseOrderLineUpdate]] = None


class PurchaseOrderReceiveRequest(BaseModel):
    """Request to receive items from a purchase order."""
    lines: List[PurchaseOrderLineReceive] = Field(min_length=1)


class PurchaseOrderLineResponse(BaseModel):
    """Response for a purchase order line."""
    id: UUID
    product_id: UUID
    product_name: str
    ordered_qty: Decimal
    received_qty: Decimal
    cost_price: Decimal
    line_total: Decimal
    batch_number: Optional[str] = None

    class Config:
        from_attributes = True


class VendorBrief(BaseModel):
    """Brief vendor info for purchase order response."""
    id: UUID
    name: str
    address: Optional[str] = None

    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    """Brief user info for purchase order response."""
    id: UUID
    name: str

    class Config:
        from_attributes = True


class PurchaseOrderResponse(BaseModel):
    """Response for a purchase order."""
    id: UUID
    reference: str
    vendor: VendorBrief
    vendor_address: Optional[str] = None
    responsible_person: Optional[UserBrief] = None
    status: str
    expected_delivery_date: Optional[str] = None
    auto_created: bool
    source_sales_order_id: Optional[UUID] = None
    source_sales_order_ref: Optional[str] = None
    lines: List[PurchaseOrderLineResponse]
    total_amount: Decimal
    created_at: datetime
    created_by: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class PurchaseOrderListResponse(BaseModel):
    """Brief response for purchase order list."""
    id: UUID
    reference: str
    vendor_name: str
    status: str
    expected_delivery_date: Optional[str] = None
    auto_created: bool
    total_amount: Decimal
    created_at: datetime

    class Config:
        from_attributes = True
