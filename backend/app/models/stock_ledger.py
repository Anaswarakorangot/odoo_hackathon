import uuid
import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column, String, Numeric, DateTime, Enum, ForeignKey, CheckConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class LedgerMovementEnum(enum.Enum):
    po_receipt = "po_receipt"
    so_delivery = "so_delivery"
    mo_produce = "mo_produce"
    mo_consume = "mo_consume"
    manual_adjustment = "manual_adjustment"


class StockLedger(Base):
    __tablename__ = "stock_ledger"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False
    )
    movement_type = Column(
        Enum(LedgerMovementEnum, name="ledger_movement_enum"),
        nullable=False
    )
    qty_change = Column(Numeric(14, 3), nullable=False)
    qty_before = Column(Numeric(14, 3), nullable=False)
    qty_after = Column(Numeric(14, 3), nullable=False)
    reference_type = Column(String(40), nullable=False)
    reference_id = Column(UUID(as_uuid=True), nullable=False)
    occurred_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "qty_after = qty_before + qty_change",
            name="chk_qty_math"
        ),
        Index("idx_ledger_product_time", "product_id", "occurred_at"),
        Index("idx_ledger_reference", "reference_type", "reference_id"),
    )

    # Relationships
    product = relationship("Product", back_populates="stock_ledger_entries")
    created_by_user = relationship("User", back_populates="stock_ledger_entries")
