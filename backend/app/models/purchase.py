import uuid
import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column, String, Numeric, Boolean, Date, DateTime, Enum, ForeignKey, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class POStatusEnum(enum.Enum):
    draft = "draft"
    confirmed = "confirmed"
    partially_received = "partially_received"
    fully_received = "fully_received"
    cancelled = "cancelled"


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference = Column(String(40), unique=True, nullable=False)
    vendor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vendors.id"),
        nullable=False
    )
    vendor_address = Column(String(250), nullable=True)
    responsible_person_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )
    status = Column(
        Enum(POStatusEnum, name="po_status_enum"),
        nullable=False,
        default=POStatusEnum.draft
    )
    expected_delivery_date = Column(Date, nullable=True)
    auto_created = Column(Boolean, nullable=False, default=False)
    source_sales_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sales_orders.id"),
        nullable=True
    )
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )

    # Relationships
    vendor = relationship("Vendor", back_populates="purchase_orders")
    responsible_person = relationship(
        "User",
        foreign_keys=[responsible_person_id],
        back_populates="purchase_orders_as_responsible"
    )
    created_by_user = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="purchase_orders_created"
    )
    source_sales_order = relationship(
        "SalesOrder",
        back_populates="purchase_orders_sourced"
    )
    lines = relationship("PurchaseOrderLine", back_populates="purchase_order", cascade="all, delete-orphan")


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False
    )
    ordered_qty = Column(Numeric(14, 3), nullable=False)
    received_qty = Column(Numeric(14, 3), nullable=False, default=Decimal("0"))
    cost_price = Column(Numeric(14, 2), nullable=False)
    batch_number = Column(String(60), nullable=True)

    __table_args__ = (
        CheckConstraint("ordered_qty > 0", name="purchase_order_lines_ordered_qty_check"),
        CheckConstraint("received_qty >= 0", name="purchase_order_lines_received_qty_check"),
        CheckConstraint("received_qty <= ordered_qty", name="chk_received_not_over"),
    )

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="lines")
    product = relationship("Product", back_populates="purchase_order_lines")
