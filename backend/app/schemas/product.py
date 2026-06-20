from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.product import ProcurementTypeEnum, ProductTypeEnum


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    product_type: ProductTypeEnum = ProductTypeEnum.finished_good
    sales_price: Decimal = Field(ge=0)
    cost_price: Decimal = Field(ge=0)
    procure_on_demand: bool = False
    procurement_type: Optional[ProcurementTypeEnum] = None
    vendor_id: Optional[UUID] = None
    default_bom_id: Optional[UUID] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    # name is included so the handler can reject the change explicitly
    # rather than letting Pydantic silently drop it as an extra field.
    name: Optional[str] = None
    product_type: Optional[ProductTypeEnum] = None
    sales_price: Optional[Decimal] = Field(default=None, ge=0)
    cost_price: Optional[Decimal] = Field(default=None, ge=0)
    procure_on_demand: Optional[bool] = None
    procurement_type: Optional[ProcurementTypeEnum] = None
    vendor_id: Optional[UUID] = None
    default_bom_id: Optional[UUID] = None


class Product(ProductBase):
    id: UUID
    on_hand_qty: Decimal
    reserved_qty: Decimal
    free_to_use_qty: Decimal

    class Config:
        from_attributes = True


class ProductStock(BaseModel):
    on_hand_qty: Decimal
    reserved_qty: Decimal
    free_to_use_qty: Decimal


class VendorOption(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True


class BomOption(BaseModel):
    id: UUID
    reference: str

    class Config:
        from_attributes = True


class FieldError(BaseModel):
    field: str
    message: str


class ValidationErrorResponse(BaseModel):
    detail: List[FieldError]
