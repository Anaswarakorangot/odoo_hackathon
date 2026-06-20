import uuid
import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column, String, Numeric, Date, DateTime, Enum, ForeignKey, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class SOStatusEnum(enum.Enum):
    draft = "draft"
    confirmed = "confirmed"
    partially_delivered = "partially_delivered"
    fully_delivered = "fully_delivered"
    cancelled = "cancelled"


class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference = Column(String(40), unique=True, nullable=False)
    customer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("customers.id"),
        nullable=False
    )
    customer_address = Column(String(250), nullable=True)
    salesperson_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )
    status = Column(
        Enum(SOStatusEnum, name="so_status_enum"),
        nullable=False,
        default=SOStatusEnum.draft
    )
    expected_delivery_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )

    # Relationships
    customer = relationship("Customer", back_populates="sales_orders")
    salesperson = relationship(
        "User",
        foreign_keys=[salesperson_id],
        back_populates="sales_orders_as_salesperson"
    )
    created_by_user = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="sales_orders_created"
    )
    lines = relationship("SalesOrderLine", back_populates="sales_order", cascade="all, delete-orphan")
    purchase_orders_sourced = relationship(
        "PurchaseOrder",
        back_populates="source_sales_order"
    )
    manufacturing_orders_sourced = relationship(
        "ManufacturingOrder",
        back_populates="source_sales_order"
    )


class SalesOrderLine(Base):
    __tablename__ = "sales_order_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sales_orders.id", ondelete="CASCADE"),
        nullable=False
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False
    )
    ordered_qty = Column(Numeric(14, 3), nullable=False)
    delivered_qty = Column(Numeric(14, 3), nullable=False, default=Decimal("0"))
    sales_price = Column(Numeric(14, 2), nullable=False)

    __table_args__ = (
        CheckConstraint("ordered_qty > 0", name="sales_order_lines_ordered_qty_check"),
        CheckConstraint("delivered_qty >= 0", name="sales_order_lines_delivered_qty_check"),
        CheckConstraint("delivered_qty <= ordered_qty", name="chk_delivered_not_over"),
    )

    # Relationships
    sales_order = relationship("SalesOrder", back_populates="lines")
    product = relationship("Product", back_populates="sales_order_lines")
