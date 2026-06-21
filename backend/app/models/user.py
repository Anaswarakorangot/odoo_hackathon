import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    Column, String, Text, Boolean, DateTime, Enum, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, validates

from app.db.database import Base


class RoleEnum(enum.Enum):
    sales = "sales"
    purchase = "purchase"
    manufacturing = "manufacturing"
    inventory = "inventory"
    owner = "owner"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False)
    login_id = Column(String(12), unique=True, nullable=False)
    email = Column(String(160), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    role = Column(Enum(RoleEnum, name="role_enum"), nullable=True)
    is_system_admin = Column(Boolean, nullable=False, default=False)
    address = Column(String(250), nullable=True)
    mobile_number = Column(String(20), nullable=True)
    position = Column(String(80), nullable=True)
    photo_url = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint(
            "length(login_id) >= 6 AND length(login_id) <= 12",
            name="chk_login_id_length"
        ),
        CheckConstraint(
            "is_system_admin = true OR role IS NOT NULL",
            name="chk_role_or_admin"
        ),
    )

    # Relationships (back_populates will be defined in related models)
    sales_orders_as_salesperson = relationship(
        "SalesOrder", foreign_keys="SalesOrder.salesperson_id", back_populates="salesperson"
    )
    sales_orders_created = relationship(
        "SalesOrder", foreign_keys="SalesOrder.created_by", back_populates="created_by_user"
    )
    purchase_orders_as_responsible = relationship(
        "PurchaseOrder", foreign_keys="PurchaseOrder.responsible_person_id", back_populates="responsible_person"
    )
    purchase_orders_created = relationship(
        "PurchaseOrder", foreign_keys="PurchaseOrder.created_by", back_populates="created_by_user"
    )
    manufacturing_orders_assigned = relationship(
        "ManufacturingOrder", foreign_keys="ManufacturingOrder.assignee_id", back_populates="assignee"
    )
    manufacturing_orders_created = relationship(
        "ManufacturingOrder", foreign_keys="ManufacturingOrder.created_by", back_populates="created_by_user"
    )
    stock_ledger_entries = relationship("StockLedger", back_populates="created_by_user")
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")

    @validates("login_id")
    def validate_login_id(self, key, value):
        if value is None:
            raise ValueError("login_id cannot be None")
        if not (6 <= len(value) <= 12):
            raise ValueError("login_id must be between 6 and 12 characters")
        return value

from app.models.user_settings import UserSettings
