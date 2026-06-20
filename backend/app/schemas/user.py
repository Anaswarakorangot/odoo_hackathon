from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator

from app.models.user import RoleEnum


class UserBase(BaseModel):
    name: str
    login_id: str
    email: EmailStr
    role: Optional[RoleEnum] = None
    is_system_admin: bool = False
    address: Optional[str] = None
    mobile_number: Optional[str] = None
    position: Optional[str] = None
    photo_url: Optional[str] = None

    @field_validator("login_id")
    @classmethod
    def validate_login_id_length(cls, v: str) -> str:
        if not (6 <= len(v) <= 12):
            raise ValueError("login_id must be between 6 and 12 characters")
        return v


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    """
    Fields that can be updated on a user.

    Note: is_system_admin is deliberately NOT included here.
    Admin promotion/demotion is a sensitive action that should not be
    bundled into a generic update - same principle as SignupRequest.
    """
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[RoleEnum] = None
    address: Optional[str] = None
    mobile_number: Optional[str] = None
    position: Optional[str] = None
    photo_url: Optional[str] = None


class User(UserBase):
    id: UUID

    class Config:
        from_attributes = True
