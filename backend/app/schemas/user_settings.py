from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class UserSettingsBase(BaseModel):
    default_landing_module: Optional[str] = None
    default_list_view: str = "table"
    rows_per_page: int = 25
    theme: str = "system"
    notification_prefs: Dict[str, bool] = {}

class UserSettingsUpdate(BaseModel):
    default_landing_module: Optional[str] = None
    default_list_view: Optional[str] = None
    rows_per_page: Optional[int] = None
    theme: Optional[str] = None
    notification_prefs: Optional[Dict[str, bool]] = None

class UserSettingsResponse(UserSettingsBase):
    available_landing_modules: List[str]
    available_notification_keys: List[str]

    class Config:
        from_attributes = True
