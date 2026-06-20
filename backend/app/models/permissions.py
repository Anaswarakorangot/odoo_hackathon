import uuid

from sqlalchemy import (
    Column, String, Boolean, Enum, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID

from app.db.database import Base
from app.models.user import RoleEnum


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role = Column(
        Enum(RoleEnum, name="role_enum", create_type=False),
        nullable=False
    )
    module = Column(String(40), nullable=False)
    action = Column(String(40), nullable=False)
    allowed = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("role", "module", "action", name="role_permissions_role_module_action_key"),
    )
