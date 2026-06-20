"""
Audit service — insert AuditLog rows. Caller owns the transaction.
"""

from __future__ import annotations

from typing import Optional, Union
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditActionEnum, AuditLog


def _coerce_action(action: Union[str, AuditActionEnum]) -> AuditActionEnum:
    if isinstance(action, AuditActionEnum):
        return action
    try:
        return AuditActionEnum(action)
    except ValueError as exc:
        raise ValueError(f"Unknown audit action: {action!r}") from exc


def log_change(
    db: Session,
    *,
    user_id: Optional[UUID],
    module: str,
    record_type: str,
    record_id: UUID,
    action: Union[str, AuditActionEnum],
    field_changed: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> AuditLog:
    """
    Record a single audit entry. Flushes but does not commit so the caller's
    transaction can roll back together with the underlying mutation if needed.
    """
    entry = AuditLog(
        user_id=user_id,
        module=module,
        record_type=record_type,
        record_id=record_id,
        action=_coerce_action(action),
        field_changed=field_changed,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
    )
    db.add(entry)
    db.flush()
    return entry
