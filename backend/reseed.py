from app.db.database import SessionLocal
from app.models.permissions import RolePermission
from app.models.user_settings import UserSettings
from app.db.seed_permissions import seed_role_permissions

db = SessionLocal()
# Delete all existing role permissions
db.query(RolePermission).delete()
db.commit()

# Reseed
seed_role_permissions(db)
print("Permissions re-seeded successfully.")
