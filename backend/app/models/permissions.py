import uuid

from sqlalchemy import (
    Column, String, Boolean, Enum, UniqueConstraint, ForeignKey
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


class UserPermissionOverride(Base):
    """
    Per-user permission overrides that layer ON TOP of role_permissions.

    An override row exists for (user_id, module, action) when admin has explicitly
    granted or denied that combination at the user level. When checking permissions:
      1. If user is_system_admin -> bypass
      2. If a row exists in user_permission_overrides for (user, module, action),
         use its `allowed` value.
      3. Else fall back to role_permissions for (user.role, module, action).

    Storing both grants AND denials lets admins do "this Sales user CAN view Audit Logs"
    or "this Manufacturing user CANNOT delete records" without touching the role default.
    """
    __tablename__ = "user_permission_overrides"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module = Column(String(40), nullable=False)
    action = Column(String(40), nullable=False)
    allowed = Column(Boolean, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "module", "action", name="user_permission_overrides_user_module_action_key"),
    )
