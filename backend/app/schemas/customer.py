"""
Customer schemas for request/response validation.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class CustomerCreate(BaseModel):
    """Request to create a customer."""
    name: str
    address: Optional[str] = None


class CustomerUpdate(BaseModel):
    """Request to update a customer."""
    name: Optional[str] = None
    address: Optional[str] = None


class CustomerResponse(BaseModel):
    """Response for a customer."""
    id: UUID
    name: str
    address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
