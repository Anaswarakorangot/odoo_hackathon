from datetime import timedelta
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.api.dependencies import db_dependency
from app.core.config import settings
from app.core.security import verify_password, create_access_token, get_password_hash, validate_password
from app.models.user import User
from app.schemas.token import Token
from app.schemas.auth import SignupRequest, LoginRequest, LoginResponse, ResetPasswordRequest

router = APIRouter(prefix="/auth", tags=["auth"])


class FieldError(BaseModel):
    field: str
    message: str


class ValidationErrorResponse(BaseModel):
    detail: List[FieldError]


def create_field_error(field: str, message: str) -> HTTPException:
    """Create a 422 error with field-specific detail"""
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=[{"field": field, "message": message}]
    )


def create_multi_field_error(errors: List[FieldError]) -> HTTPException:
    """Create a 422 error with multiple field-specific details"""
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=[{"field": e.field, "message": e.message} for e in errors]
    )


@router.post("/signup", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def signup(request: SignupRequest, db: db_dependency):
    """
    User signup with field-specific validation errors.

    SECURITY: This is the PUBLIC signup endpoint. Only regular users can self-register.
    System Administrators can ONLY be created by an existing System Administrator
    via the admin-only POST /users endpoint. The is_system_admin field is hardcoded
    to False here regardless of what the client sends.

    Validation rules per wireframe:
    1. login_id must be unique and between 6-12 characters
    2. email must not be a duplicate in the database
    3. password must contain a lowercase letter, an uppercase letter,
       and a special character, and must be more than 8 characters long
    """
    errors: List[FieldError] = []

    # Validate login_id length (6-12 characters)
    if len(request.login_id) < 6 or len(request.login_id) > 12:
        errors.append(FieldError(
            field="login_id",
            message="Login ID must be between 6 and 12 characters"
        ))

    # Check login_id uniqueness
    existing_login = db.query(User).filter(User.login_id == request.login_id).first()
    if existing_login:
        errors.append(FieldError(
            field="login_id",
            message="Login ID is already taken"
        ))

    # Check email uniqueness
    existing_email = db.query(User).filter(User.email == request.email).first()
    if existing_email:
        errors.append(FieldError(
            field="email",
            message="Email is already registered"
        ))

    # Validate password
    password_valid, password_errors = validate_password(request.password)
    if not password_valid:
        for err in password_errors:
            errors.append(FieldError(field="password", message=err))

    # Role is required for signup (since is_system_admin is always False for signup)
    if request.role is None:
        errors.append(FieldError(
            field="role",
            message="Role is required"
        ))

    # If any validation errors, return them all at once
    if errors:
        raise create_multi_field_error(errors)

    # Create the user
    # SECURITY: is_system_admin is ALWAYS False for public signup.
    # System admins can only be created by existing system admins.
    password_hash = get_password_hash(request.password)
    new_user = User(
        name=request.name,
        login_id=request.login_id,
        email=request.email,
        password_hash=password_hash,
        role=request.role,
        is_system_admin=False,  # HARDCODED - never trust client input for this field
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Generate token and return login response
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(new_user.id),
            "is_system_admin": new_user.is_system_admin,
            "role": new_user.role.value if new_user.role else None,
        },
        expires_delta=access_token_expires
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        is_system_admin=new_user.is_system_admin,
        role=new_user.role.value if new_user.role else None,
        user_id=str(new_user.id),
        name=new_user.name,
    )


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(request: ResetPasswordRequest, db: db_dependency):
    """
    Reset user password by verifying login_id and email.
    Complexity rules for the new password are also verified here.
    """
    errors: List[FieldError] = []

    # Find user by login_id
    user = db.query(User).filter(User.login_id == request.login_id).first()
    if not user:
        errors.append(FieldError(field="login_id", message="Login ID not found"))
    elif user.email != request.email:
        errors.append(FieldError(field="email", message="Email address does not match this Login ID"))

    # Validate new password complexity
    password_valid, password_errors = validate_password(request.password)
    if not password_valid:
        for err in password_errors:
            errors.append(FieldError(field="password", message=err))

    # Raise error if validation failed
    if errors:
        raise create_multi_field_error(errors)

    # Perform password update
    user.password_hash = get_password_hash(request.password)
    db.commit()

    return {"message": "Password reset successful"}


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: db_dependency):
    """
    Login by login_id + password (NOT email).

    Returns the same error message for both wrong login_id and wrong password
    to avoid leaking which one was incorrect.
    """
    # Lookup user by login_id only (per wireframe)
    user = db.query(User).filter(User.login_id == request.login_id).first()

    # Same error for both wrong login_id and wrong password
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Login Id or Password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "is_system_admin": user.is_system_admin,
            "role": user.role.value if user.role else None,
        },
        expires_delta=access_token_expires
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        is_system_admin=user.is_system_admin,
        role=user.role.value if user.role else None,
        user_id=str(user.id),
        name=user.name,
    )


# Keep OAuth2 compatible endpoint for tools/testing that expect form data
@router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: db_dependency
):
    """
    OAuth2 compatible login endpoint (for Swagger UI and OAuth2 tools).
    Uses login_id in the username field.
    """
    user = db.query(User).filter(User.login_id == form_data.username).first()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Login Id or Password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "is_system_admin": user.is_system_admin,
            "role": user.role.value if user.role else None,
        },
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
