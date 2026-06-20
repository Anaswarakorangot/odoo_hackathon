import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column, String, Integer, Numeric, DateTime, ForeignKey, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class BOM(Base):
    __tablename__ = "boms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference = Column(String(40), unique=True, nullable=False)
    finished_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False
    )
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    # Relationships
    finished_product = relationship(
        "Product",
        foreign_keys=[finished_product_id],
        back_populates="boms_as_finished_product"
    )
    products_using_as_default = relationship(
        "Product",
        foreign_keys="Product.default_bom_id",
        back_populates="default_bom"
    )
    bom_lines = relationship("BomLine", back_populates="bom", cascade="all, delete-orphan")
    bom_operations = relationship("BomOperation", back_populates="bom", cascade="all, delete-orphan")
    manufacturing_orders = relationship("ManufacturingOrder", back_populates="bom")


class BomLine(Base):
    __tablename__ = "bom_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bom_id = Column(
        UUID(as_uuid=True),
        ForeignKey("boms.id", ondelete="CASCADE"),
        nullable=False
    )
    component_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False
    )
    qty_per_unit = Column(Numeric(14, 3), nullable=False)

    __table_args__ = (
        CheckConstraint("qty_per_unit > 0", name="bom_lines_qty_per_unit_check"),
    )

    # Relationships
    bom = relationship("BOM", back_populates="bom_lines")
    component_product = relationship("Product", back_populates="bom_lines")


class BomOperation(Base):
    __tablename__ = "bom_operations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bom_id = Column(
        UUID(as_uuid=True),
        ForeignKey("boms.id", ondelete="CASCADE"),
        nullable=False
    )
    sequence = Column(Integer, nullable=False)
    operation_name = Column(String(120), nullable=False)
    work_center = Column(String(120), nullable=False)
    expected_duration_min = Column(Integer, nullable=False)

    __table_args__ = (
        CheckConstraint("expected_duration_min >= 0", name="bom_operations_expected_duration_min_check"),
    )

    # Relationships
    bom = relationship("BOM", back_populates="bom_operations")
