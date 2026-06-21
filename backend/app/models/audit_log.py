import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    Column, String, Text, DateTime, Enum, ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class AuditActionEnum(enum.Enum):
    created = "created"
    updated = "updated"
    deleted = "deleted"
    status_changed = "status_changed"
    vin_assigned = "vin_assigned"
    cascade_triggered = "cascade_triggered"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occurred_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )
    module = Column(String(40), nullable=False)
    record_type = Column(String(60), nullable=False)
    record_id = Column(UUID(as_uuid=True), nullable=False)
    action = Column(
        Enum(AuditActionEnum, name="audit_action_enum"),
        nullable=False
    )
    field_changed = Column(String(80), nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)

    __table_args__ = (
        Index("idx_audit_module_time", "module", "occurred_at"),
        Index("idx_audit_record", "record_type", "record_id"),
    )

    # Relationships
    user = relationship("User", back_populates="audit_logs")
