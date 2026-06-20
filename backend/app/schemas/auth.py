from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.user import RoleEnum


class SignupRequest(BaseModel):
    """
    Signup request matching the wireframe fields.

    Note: is_system_admin is intentionally NOT included here.
    System Administrators can only be created by existing System Administrators
    via the admin-only user creation endpoint, never via public signup.
    """
    name: str
    login_id: str
    email: EmailStr
    password: str
    role: Optional[RoleEnum] = None


class LoginRequest(BaseModel):
    """Login request - login_id + password only"""
    login_id: str
    password: str


class LoginResponse(BaseModel):
    """Login response with token and routing info"""
    access_token: str
    token_type: str = "bearer"
    is_system_admin: bool
    role: Optional[str] = None
    user_id: str
    name: str
