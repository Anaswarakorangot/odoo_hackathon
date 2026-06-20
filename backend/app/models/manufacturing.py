import uuid
import enum
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    Column, String, Integer, Numeric, Boolean, Date, DateTime, Enum, ForeignKey, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class MOStatusEnum(enum.Enum):
    draft = "draft"
    confirmed = "confirmed"
    in_progress = "in_progress"
    to_close = "to_close"
    done = "done"
    cancelled = "cancelled"


class ManufacturingOrder(Base):
    __tablename__ = "manufacturing_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference = Column(String(40), unique=True, nullable=False)
    finished_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False
    )
    bom_id = Column(
        UUID(as_uuid=True),
        ForeignKey("boms.id"),
        nullable=True
    )
    quantity = Column(Numeric(14, 3), nullable=False)
    assignee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )
    status = Column(
        Enum(MOStatusEnum, name="mo_status_enum"),
        nullable=False,
        default=MOStatusEnum.draft
    )
    auto_created = Column(Boolean, nullable=False, default=False)
    source_sales_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sales_orders.id"),
        nullable=True
    )
    parent_mo_id = Column(
        UUID(as_uuid=True),
        ForeignKey("manufacturing_orders.id"),
        nullable=True
    )
    vin_number = Column(String(40), unique=True, nullable=True)
    scheduled_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )

    __table_args__ = (
        CheckConstraint("quantity > 0", name="manufacturing_orders_quantity_check"),
    )

    # Relationships
    finished_product = relationship(
        "Product",
        foreign_keys=[finished_product_id],
        back_populates="manufacturing_orders"
    )
    bom = relationship("BOM", back_populates="manufacturing_orders")
    assignee = relationship(
        "User",
        foreign_keys=[assignee_id],
        back_populates="manufacturing_orders_assigned"
    )
    created_by_user = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="manufacturing_orders_created"
    )
    source_sales_order = relationship(
        "SalesOrder",
        back_populates="manufacturing_orders_sourced"
    )
    parent_mo = relationship(
        "ManufacturingOrder",
        remote_side=[id],
        back_populates="child_mos"
    )
    child_mos = relationship(
        "ManufacturingOrder",
        back_populates="parent_mo"
    )
    components = relationship("MoComponent", back_populates="manufacturing_order", cascade="all, delete-orphan")
    work_orders = relationship("WorkOrder", back_populates="manufacturing_order", cascade="all, delete-orphan")


class MoComponent(Base):
    __tablename__ = "mo_components"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mo_id = Column(
        UUID(as_uuid=True),
        ForeignKey("manufacturing_orders.id", ondelete="CASCADE"),
        nullable=False
    )
    component_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False
    )
    to_consume = Column(Numeric(14, 3), nullable=False)
    consumed_qty = Column(Numeric(14, 3), nullable=False, default=Decimal("0"))
    batch_number = Column(String(60), nullable=True)

    # Relationships
    manufacturing_order = relationship("ManufacturingOrder", back_populates="components")
    component_product = relationship("Product", back_populates="mo_components")


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mo_id = Column(
        UUID(as_uuid=True),
        ForeignKey("manufacturing_orders.id", ondelete="CASCADE"),
        nullable=False
    )
    sequence = Column(Integer, nullable=False)
    operation_name = Column(String(120), nullable=False)
    work_center = Column(String(120), nullable=False)
    expected_duration_min = Column(Integer, nullable=False)
    real_duration_min = Column(Integer, nullable=True)
    pass_fail = Column(String(10), nullable=True)

    # Relationships
    manufacturing_order = relationship("ManufacturingOrder", back_populates="work_orders")
