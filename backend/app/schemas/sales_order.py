"""
Sales Order schemas for request/response validation.
"""
from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class SalesOrderLineCreate(BaseModel):
    """Line item for creating a sales order."""
    product_id: UUID
    ordered_qty: Decimal = Field(gt=0)


class SalesOrderLineUpdate(BaseModel):
    """Line item for updating a sales order (in draft status)."""
    id: Optional[UUID] = None  # None for new lines
    product_id: UUID
    ordered_qty: Decimal = Field(gt=0)


class SalesOrderLineDeliver(BaseModel):
    """Line item for delivery action."""
    line_id: UUID
    delivered_qty: Decimal = Field(ge=0)


class SalesOrderCreateRequest(BaseModel):
    """Request to create a new sales order."""
    customer_id: UUID
    salesperson_id: Optional[UUID] = None
    expected_delivery_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    line_items: List[SalesOrderLineCreate] = Field(min_length=1)


class SalesOrderUpdateRequest(BaseModel):
    """Request to update a sales order (field availability depends on status)."""
    customer_id: Optional[UUID] = None
    customer_address: Optional[str] = None
    salesperson_id: Optional[UUID] = None
    expected_delivery_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    lines: Optional[List[SalesOrderLineUpdate]] = None


class SalesOrderDeliverRequest(BaseModel):
    """Request to deliver items from a sales order."""
    lines: List[SalesOrderLineDeliver] = Field(min_length=1)


class SalesOrderLineResponse(BaseModel):
    """Response for a sales order line."""
    id: UUID
    product_id: UUID
    product_name: str
    ordered_qty: Decimal
    delivered_qty: Decimal
    sales_price: Decimal
    line_total: Decimal

    class Config:
        from_attributes = True


class CustomerBrief(BaseModel):
    """Brief customer info for sales order response."""
    id: UUID
    name: str
    address: Optional[str] = None

    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    """Brief user info for sales order response."""
    id: UUID
    name: str

    class Config:
        from_attributes = True


class SalesOrderResponse(BaseModel):
    """Response for a sales order."""
    id: UUID
    reference: str
    customer: CustomerBrief
    customer_address: Optional[str] = None
    salesperson: Optional[UserBrief] = None
    status: str
    expected_delivery_date: Optional[str] = None
    lines: List[SalesOrderLineResponse]
    total_amount: Decimal
    created_at: datetime
    created_by: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class SalesOrderListResponse(BaseModel):
    """Brief response for sales order list."""
    id: UUID
    reference: str
    customer_name: str
    status: str
    expected_delivery_date: Optional[str] = None
    total_amount: Decimal
    created_at: datetime

    class Config:
        from_attributes = True
