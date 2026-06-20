"""
Pydantic schemas for audit log API responses.
"""
from datetime import datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel


class AuditLogItem(BaseModel):
    id: UUID
    module: str
    record_type: str
    record_id: UUID
    action: str
    field_changed: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    user_id: Optional[UUID] = None
    user_name: Optional[str] = None
    occurred_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: List[AuditLogItem]
    total_count: int
