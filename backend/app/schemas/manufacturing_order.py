"""
Pydantic schemas for Bill of Materials and Manufacturing Order requests/responses.
"""
from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Bill of Materials Schemas
# ---------------------------------------------------------------------------

class BomLineCreate(BaseModel):
    """A single component line on a BoM."""
    component_product_id: UUID
    qty_per_unit: Decimal = Field(gt=0)


class BomOperationCreate(BaseModel):
    """A single production step on a BoM."""
    sequence: int = Field(ge=1)
    operation_name: str = Field(min_length=1, max_length=120)
    work_center: str = Field(min_length=1, max_length=120)
    expected_duration_min: int = Field(ge=0)


class BomCreateRequest(BaseModel):
    """Request to create a new Bill of Materials."""
    finished_product_id: UUID
    bom_lines: List[BomLineCreate] = Field(default_factory=list)
    bom_operations: List[BomOperationCreate] = Field(default_factory=list)


class BomUpdateRequest(BaseModel):
    """Request to update a BoM. Lines and operations are fully replaced."""
    finished_product_id: Optional[UUID] = None
    bom_lines: Optional[List[BomLineCreate]] = None
    bom_operations: Optional[List[BomOperationCreate]] = None


class BomLineResponse(BaseModel):
    id: UUID
    component_product_id: UUID
    component_product_name: str
    qty_per_unit: Decimal

    class Config:
        from_attributes = True


class BomOperationResponse(BaseModel):
    id: UUID
    sequence: int
    operation_name: str
    work_center: str
    expected_duration_min: int

    class Config:
        from_attributes = True


class ProductBrief(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True


class BomResponse(BaseModel):
    id: UUID
    reference: str
    finished_product: ProductBrief
    bom_lines: List[BomLineResponse]
    bom_operations: List[BomOperationResponse]
    created_at: datetime

    class Config:
        from_attributes = True


class BomListResponse(BaseModel):
    id: UUID
    reference: str
    finished_product_id: UUID
    finished_product_name: str
    bom_lines_count: int
    bom_operations_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Manufacturing Order Schemas
# ---------------------------------------------------------------------------

class MoComponentUpdate(BaseModel):
    """Update consumed quantity for a single MO component."""
    component_id: UUID
    consumed_qty: Decimal = Field(ge=0)
    batch_number: Optional[str] = None


class WorkOrderUpdate(BaseModel):
    """Update real duration for a single work order."""
    work_order_id: UUID
    real_duration_min: Optional[int] = Field(default=None, ge=0)
    pass_fail: Optional[str] = Field(default=None, max_length=10)


class ManufacturingOrderCreateRequest(BaseModel):
    """Request to create a Manufacturing Order."""
    finished_product_id: UUID
    quantity: Decimal = Field(gt=0)
    bom_id: Optional[UUID] = None
    assignee_id: Optional[UUID] = None
    scheduled_date: Optional[str] = None  # ISO date string


class ManufacturingOrderUpdateRequest(BaseModel):
    """
    Update a Manufacturing Order.
    Draft: finished_product_id, bom_id, quantity, assignee_id, scheduled_date all editable.
    Confirmed/In-Progress: only components.consumed_qty and work_orders.real_duration_min editable.
    """
    finished_product_id: Optional[UUID] = None
    bom_id: Optional[UUID] = None
    quantity: Optional[Decimal] = Field(default=None, gt=0)
    assignee_id: Optional[UUID] = None
    scheduled_date: Optional[str] = None  # ISO date string
    components: Optional[List[MoComponentUpdate]] = None
    work_orders: Optional[List[WorkOrderUpdate]] = None


class MoComponentResponse(BaseModel):
    id: UUID
    component_product_id: UUID
    component_product_name: str
    to_consume: Decimal
    consumed_qty: Decimal
    batch_number: Optional[str]
    # Availability check: is on-hand enough to cover to_consume?
    free_to_use_qty: Optional[Decimal] = None

    class Config:
        from_attributes = True


class WorkOrderResponse(BaseModel):
    id: UUID
    sequence: int
    operation_name: str
    work_center: str
    expected_duration_min: int
    real_duration_min: Optional[int]
    pass_fail: Optional[str]

    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True


class SalesOrderBrief(BaseModel):
    id: UUID
    reference: str

    class Config:
        from_attributes = True


class MoBrief(BaseModel):
    """Brief reference to a related Manufacturing Order (parent or child)."""
    id: UUID
    reference: str

    class Config:
        from_attributes = True


class ManufacturingOrderResponse(BaseModel):
    id: UUID
    reference: str
    finished_product: ProductBrief
    bom_id: Optional[UUID]
    quantity: Decimal
    status: str
    auto_created: bool
    source_sales_order_id: Optional[UUID]
    source_sales_order_ref: Optional[str]
    # Parent/child MO hierarchy for recursive cascade
    parent_mo_id: Optional[UUID] = None
    parent_mo_ref: Optional[str] = None
    child_mos: List[MoBrief] = []
    assignee: Optional[UserBrief]
    scheduled_date: Optional[str]
    vin_number: Optional[str] = None
    components: List[MoComponentResponse]
    work_orders: List[WorkOrderResponse]
    created_at: datetime
    created_by: Optional[UserBrief]

    class Config:
        from_attributes = True


class ManufacturingOrderListResponse(BaseModel):
    id: UUID
    reference: str
    finished_product_id: UUID
    finished_product_name: str
    quantity: Decimal
    status: str
    auto_created: bool
    source_sales_order_id: Optional[UUID]
    parent_mo_id: Optional[UUID] = None
    parent_mo_ref: Optional[str] = None
    vin_number: Optional[str] = None
    scheduled_date: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
