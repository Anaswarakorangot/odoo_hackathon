"""
Audit Log routes — read-only query layer over the existing audit_logs table.

No new writes; every other module already calls audit_service.log_change.
This endpoint lets Admins (and any role with AuditLog/view permission) answer
"who changed what, and when" with filters for module, user, action, record,
and date range.
"""
from datetime import date, datetime, time
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import (
    db_dependency,
    require_permission,
)
from app.models.audit_log import AuditLog, AuditActionEnum
from app.models.user import User
from app.schemas.audit_log import AuditLogItem, AuditLogListResponse

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get(
    "/",
    response_model=AuditLogListResponse,
    dependencies=[Depends(require_permission("AuditLog", "view"))],
)
def list_audit_logs(
    db: db_dependency,
    module: Optional[str] = Query(None, description="Filter by module (e.g. Sales, Purchase, Manufacturing, Product, BoM)"),
    user_id: Optional[UUID] = Query(None, description="Filter by the user who made the change"),
    action: Optional[str] = Query(None, description="Filter by action (created, updated, deleted, status_changed)"),
    record_id: Optional[UUID] = Query(None, description="Filter by specific record UUID (deep-link case)"),
    date_from: Optional[date] = Query(None, description="Inclusive start date (ISO format)"),
    date_to: Optional[date] = Query(None, description="Inclusive end date (ISO format)"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=200, description="Items per page (max 200)"),
):
    """
    List audit log entries with optional filters, sorted by most recent first.

    All filters combine with AND. Pagination defaults to page 1, 50 items.
    """
    query = db.query(AuditLog).options(joinedload(AuditLog.user))

    # --- Filters ---
    if module is not None:
        query = query.filter(AuditLog.module == module)

    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)

    if action is not None:
        try:
            action_enum = AuditActionEnum(action)
        except ValueError:
            # Return empty if action doesn't match any known enum value
            return AuditLogListResponse(items=[], total_count=0)
        query = query.filter(AuditLog.action == action_enum)

    if record_id is not None:
        query = query.filter(AuditLog.record_id == record_id)

    if date_from is not None:
        query = query.filter(AuditLog.occurred_at >= datetime.combine(date_from, time.min))

    if date_to is not None:
        # Inclusive: end of the given day
        query = query.filter(AuditLog.occurred_at <= datetime.combine(date_to, time.max))

    # --- Total count (before pagination) ---
    total_count = query.count()

    # --- Sort & paginate ---
    offset = (page - 1) * page_size
    rows = (
        query
        .order_by(AuditLog.occurred_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # --- Build response ---
    items = [
        AuditLogItem(
            id=row.id,
            module=row.module,
            record_type=row.record_type,
            record_id=row.record_id,
            action=row.action.value,
            field_changed=row.field_changed,
            old_value=row.old_value,
            new_value=row.new_value,
            user_id=row.user_id,
            user_name=row.user.name if row.user else None,
            occurred_at=row.occurred_at,
        )
        for row in rows
    ]

    return AuditLogListResponse(items=items, total_count=total_count)
