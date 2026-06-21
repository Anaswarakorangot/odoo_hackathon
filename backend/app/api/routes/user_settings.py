from typing import List
from fastapi import APIRouter, HTTPException, status
from app.api.dependencies import db_dependency, current_user_dependency
from app.models.user_settings import UserSettings
from app.models.permissions import RolePermission
from app.schemas.user_settings import UserSettingsResponse, UserSettingsUpdate

router = APIRouter(prefix="/users/me/settings", tags=["user_settings"])

MODULE_NOTIFICATION_MAP = {
    "Sales": ["so_status_changed", "procurement_auto_triggered"],
    "Purchase": ["po_status_changed", "po_auto_created_from_so"],
    "Manufacturing": ["mo_status_changed", "component_shortage_on_confirm", "assigned_to_work_order"],
    "Inventory": ["low_stock_threshold_crossed"],
}

def get_user_allowed_modules(user, db) -> List[str]:
    if user.is_system_admin:
        return ["Dashboard", "Sales", "Purchase", "Manufacturing", "Inventory", "Product", "BoM"]
    
    if not user.role:
        return ["Dashboard"]

    # Get modules where user has 'view' action based on their role
    permissions = db.query(RolePermission).filter(
        RolePermission.role == user.role, 
        RolePermission.action == "view",
        RolePermission.allowed == True
    ).all()
    modules = set([p.module for p in permissions])
    # Everyone gets Dashboard usually
    modules.add("Dashboard")
    return list(modules)

def get_user_notification_keys(user, db) -> List[str]:
    if user.is_system_admin or (user.role and user.role.name == "owner"):
        keys = set()
        for mod_keys in MODULE_NOTIFICATION_MAP.values():
            keys.update(mod_keys)
        keys.add("delayed_order_alert")
        return list(keys)

    allowed_modules = get_user_allowed_modules(user, db)
    keys = set()
    for mod in allowed_modules:
        if mod in MODULE_NOTIFICATION_MAP:
            keys.update(MODULE_NOTIFICATION_MAP[mod])
    return list(keys)

@router.get("", response_model=UserSettingsResponse)
def get_settings(current_user: current_user_dependency, db: db_dependency):
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not settings:
        settings = UserSettings(user_id=current_user.id)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    allowed_modules = get_user_allowed_modules(current_user, db)
    notification_keys = get_user_notification_keys(current_user, db)

    settings_dict = {
        "default_landing_module": settings.default_landing_module,
        "default_list_view": settings.default_list_view,
        "rows_per_page": settings.rows_per_page,
        "theme": settings.theme,
        "notification_prefs": settings.notification_prefs,
        "available_landing_modules": allowed_modules,
        "available_notification_keys": notification_keys,
    }
    return UserSettingsResponse(**settings_dict)

@router.put("", response_model=UserSettingsResponse)
def update_settings(update_data: UserSettingsUpdate, current_user: current_user_dependency, db: db_dependency):
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not settings:
        settings = UserSettings(user_id=current_user.id)
        db.add(settings)

    allowed_modules = get_user_allowed_modules(current_user, db)

    if update_data.default_landing_module and update_data.default_landing_module not in allowed_modules:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot set landing module to {update_data.default_landing_module}. You do not have access."
        )

    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)

    notification_keys = get_user_notification_keys(current_user, db)

    settings_dict = {
        "default_landing_module": settings.default_landing_module,
        "default_list_view": settings.default_list_view,
        "rows_per_page": settings.rows_per_page,
        "theme": settings.theme,
        "notification_prefs": settings.notification_prefs,
        "available_landing_modules": allowed_modules,
        "available_notification_keys": notification_keys,
    }
    return UserSettingsResponse(**settings_dict)
