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
    name: Optional[str] = None
    login_id: str
    email: EmailStr
    password: str
    role: Optional[RoleEnum] = None


class ResetPasswordRequest(BaseModel):
    """Reset password request - verify login_id and email, then update password"""
    login_id: str
    email: str
    password: str

class ChangePasswordRequest(BaseModel):
    """Change password request for authenticated users"""
    current_password: str
    new_password: str


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
