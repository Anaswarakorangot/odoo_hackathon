from typing import Annotated, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.user import User, RoleEnum
from app.models.permissions import RolePermission
from app.schemas.token import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


db_dependency = Annotated[Session, Depends(get_db)]


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: db_dependency) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id)
    except JWTError:
        raise credentials_exception

    try:
        user_uuid = UUID(token_data.user_id)
    except ValueError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise credentials_exception
    return user


current_user_dependency = Annotated[User, Depends(get_current_user)]


def allow_product_price_read(current_user: User, db: Session) -> bool:
    """
    Special permission helper: product price reads must always succeed for any user
    who has ANY level of Sales module access (view/create/edit).

    This is separate from the general Product permission to allow Sales Order forms
    to display product prices without requiring Product-module access.
    """
    if current_user.is_system_admin:
        return True

    if current_user.role is None:
        return False

    # Check if user has any Sales module access
    sales_permission = db.query(RolePermission).filter(
        RolePermission.role == current_user.role,
        RolePermission.module == "Sales",
        RolePermission.action.in_(["view", "create", "edit"]),
        RolePermission.allowed == True
    ).first()

    return sales_permission is not None


def require_permission(module: str, action: str) -> Callable:
    """
    FastAPI dependency factory that checks role_permissions.

    - If current_user.is_system_admin is True, allows everything
    - Otherwise queries role_permissions for (current_user.role, module, action)
    - Raises 403 if not allowed or no row exists

    Usage:
        @router.get("/sales-orders", dependencies=[Depends(require_permission("Sales", "view"))])
        def list_sales_orders(...):
            ...
    """
    def permission_checker(
        current_user: current_user_dependency,
        db: db_dependency
    ) -> User:
        # System admins bypass all permission checks
        if current_user.is_system_admin:
            return current_user

        # Non-admin users must have a role
        if current_user.role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: no role assigned"
            )

        # Check role_permissions table
        permission = db.query(RolePermission).filter(
            RolePermission.role == current_user.role,
            RolePermission.module == module,
            RolePermission.action == action
        ).first()

        # No row exists or not allowed
        if permission is None or not permission.allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {action} permission on {module} module not granted"
            )

        return current_user

    return permission_checker


def require_system_admin(current_user: current_user_dependency) -> User:
    """
    Dependency that requires the current user to be a system admin.
    Used for user management and role_permissions configuration.
    """
    if not current_user.is_system_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: system administrator privileges required"
        )
    return current_user


system_admin_dependency = Annotated[User, Depends(require_system_admin)]
