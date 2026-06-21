import uuid
from sqlalchemy import Column, String, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.schema import ForeignKey

from app.db.database import Base

class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    default_landing_module = Column(String(50), nullable=True)
    default_list_view = Column(String(20), nullable=False, default="table")
    rows_per_page = Column(Integer, nullable=False, default=25)
    theme = Column(String(20), nullable=False, default="system")
    notification_prefs = Column(JSON, nullable=False, default={})

    # Relationships
    user = relationship("User", back_populates="settings")
