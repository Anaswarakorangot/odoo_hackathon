from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import (
    db_dependency,
    get_current_user,
    require_system_admin,
    current_user_dependency,
    system_admin_dependency,
)
from app.core.security import get_password_hash, validate_password
from app.models.user import User as UserModel
from app.schemas.user import User, UserCreate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=User, status_code=status.HTTP_201_CREATED)
def create_user(
    user: UserCreate,
    db: db_dependency,
    admin: system_admin_dependency,  # Only system admins can create users
):
    """
    Create a new user. Only accessible by system administrators.
    For self-registration, use the /auth/signup endpoint.
    """
    errors = []

    # Validate login_id length
    if len(user.login_id) < 6 or len(user.login_id) > 12:
        errors.append({"field": "login_id", "message": "Login ID must be between 6 and 12 characters"})

    # Check login_id uniqueness
    if db.query(UserModel).filter(UserModel.login_id == user.login_id).first():
        errors.append({"field": "login_id", "message": "Login ID is already taken"})

    # Check email uniqueness
    if db.query(UserModel).filter(UserModel.email == user.email).first():
        errors.append({"field": "email", "message": "Email is already registered"})

    # Validate password
    password_valid, password_errors = validate_password(user.password)
    if not password_valid:
        for err in password_errors:
            errors.append({"field": "password", "message": err})

    # Validate role/admin constraint
    if not user.is_system_admin and user.role is None:
        errors.append({"field": "role", "message": "Role is required for non-admin users"})

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=errors
        )

    password_hash = get_password_hash(user.password)
    new_user = UserModel(
        name=user.name,
        login_id=user.login_id,
        email=user.email,
        password_hash=password_hash,
        role=user.role,
        is_system_admin=user.is_system_admin,
        address=user.address,
        mobile_number=user.mobile_number,
        position=user.position,
        photo_url=user.photo_url,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.get("/", response_model=List[User])
def list_users(
    db: db_dependency,
    admin: system_admin_dependency,  # Only system admins can list all users
):
    """List all users. Only accessible by system administrators."""
    users = db.query(UserModel).all()
    return users


@router.get("/me", response_model=User)
def read_users_me(current_user: current_user_dependency):
    """Get the current authenticated user's profile."""
    return current_user


@router.patch("/me", response_model=User)
def update_current_user(
    user_update: UserUpdate,
    current_user: current_user_dependency,
    db: db_dependency,
):
    """
    Update the current user's own profile.
    Note: Users cannot change their own role or is_system_admin status.
    """
    update_data = user_update.model_dump(exclude_unset=True)

    # Users cannot change their own role or admin status
    update_data.pop("role", None)
    update_data.pop("is_system_admin", None)
    update_data.pop("position", None)  # Position is set by admin only per spec

    # Check email uniqueness if being updated
    if "email" in update_data and update_data["email"] != current_user.email:
        if db.query(UserModel).filter(UserModel.email == update_data["email"]).first():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"field": "email", "message": "Email is already registered"}]
            )

    for field, value in update_data.items():
        setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/{user_id}", response_model=User)
def get_user(
    user_id: UUID,
    db: db_dependency,
    admin: system_admin_dependency,  # Only system admins can view other users
):
    """Get a specific user by ID. Only accessible by system administrators."""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=User)
def update_user(
    user_id: UUID,
    user_update: UserUpdate,
    db: db_dependency,
    admin: system_admin_dependency,  # Only system admins can update users
):
    """
    Update a user's profile. Only accessible by system administrators.
    System admins can set role and position, but NOT is_system_admin.

    Note: is_system_admin is deliberately excluded - promoting/demoting admins
    should be a separate, auditable action, not bundled into a generic update.
    """
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.model_dump(exclude_unset=True)

    # SECURITY: Strip is_system_admin - this field cannot be changed via generic update
    # Same pattern as signup hardcoding is_system_admin=False
    update_data.pop("is_system_admin", None)

    # Check email uniqueness if being updated
    if "email" in update_data and update_data["email"] != user.email:
        if db.query(UserModel).filter(UserModel.email == update_data["email"]).first():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"field": "email", "message": "Email is already registered"}]
            )

    # Validate role/admin constraint after update
    new_role = update_data.get("role", user.role)
    if not user.is_system_admin and new_role is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"field": "role", "message": "Role is required for non-admin users"}]
        )

    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: db_dependency,
    admin: system_admin_dependency,  # Only system admins can delete users
):
    """Delete a user. Only accessible by system administrators."""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deletion
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )

    db.delete(user)
    db.commit()
    return None
