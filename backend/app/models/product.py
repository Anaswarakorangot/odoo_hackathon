import uuid
import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column, String, Numeric, Boolean, DateTime, Enum, ForeignKey, CheckConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class ProductTypeEnum(enum.Enum):
    finished_good = "finished_good"
    sub_assembly = "sub_assembly"
    raw_component = "raw_component"


class ProcurementTypeEnum(enum.Enum):
    purchase = "purchase"
    manufacturing = "manufacturing"


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(160), nullable=False)
    product_type = Column(
        Enum(ProductTypeEnum, name="product_type_enum"),
        nullable=False,
        default=ProductTypeEnum.finished_good
    )
    sales_price = Column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    cost_price = Column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    on_hand_qty = Column(Numeric(14, 3), nullable=False, default=Decimal("0"))
    reserved_qty = Column(Numeric(14, 3), nullable=False, default=Decimal("0"))
    procure_on_demand = Column(Boolean, nullable=False, default=False)
    procurement_type = Column(
        Enum(ProcurementTypeEnum, name="procurement_type_enum"),
        nullable=True
    )
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=True)
    # Circular FK to boms - use use_alter=True to handle creation order
    default_bom_id = Column(
        UUID(as_uuid=True),
        ForeignKey("boms.id", use_alter=True, name="fk_products_default_bom"),
        nullable=True
    )
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint(
            "(procure_on_demand = false) OR (procure_on_demand = true AND procurement_type IS NOT NULL)",
            name="chk_procure_fields"
        ),
        Index("idx_products_type", "product_type"),
    )

    # Relationships
    vendor = relationship("Vendor", back_populates="products")
    default_bom = relationship(
        "BOM",
        foreign_keys=[default_bom_id],
        back_populates="products_using_as_default"
    )
    boms_as_finished_product = relationship(
        "BOM",
        foreign_keys="BOM.finished_product_id",
        back_populates="finished_product"
    )
    bom_lines = relationship("BomLine", back_populates="component_product")
    sales_order_lines = relationship("SalesOrderLine", back_populates="product")
    purchase_order_lines = relationship("PurchaseOrderLine", back_populates="product")
    manufacturing_orders = relationship(
        "ManufacturingOrder",
        foreign_keys="ManufacturingOrder.finished_product_id",
        back_populates="finished_product"
    )
    mo_components = relationship("MoComponent", back_populates="component_product")
    stock_ledger_entries = relationship("StockLedger", back_populates="product")
