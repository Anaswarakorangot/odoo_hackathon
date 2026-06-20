"""
Seed default role_permissions on startup if the table is empty.

This is a one-time idempotent seed that only runs when there are no permissions defined.

IMPORTANT - Permission Matrix from Wireframe:
==============================================
The wireframe specifies Admin/User/None columns for each module+action.
- "Admin" means is_system_admin=True users (they bypass role_permissions entirely)
- "User" means regular role-based users get this permission
- "None" means denied for regular users

Key design decisions:
1. The `approve` action gates SO/PO Confirm buttons. Per spec, only System Admins
   (is_system_admin=True) can confirm orders, NOT the sales/purchase user who created
   them. This is counter-intuitive but intentional - don't "fix" by granting approve
   to sales/purchase roles.

2. Manufacturing uses `production_entry` (for creating production records) and
   `edit_bom` (for editing BOMs) instead of generic create/edit actions.

3. Owner role is a Business Owner who "manages product" - they get create/edit
   on Product specifically, but only view access elsewhere.
"""
from sqlalchemy.orm import Session

from app.models.user import RoleEnum
from app.models.permissions import RolePermission


# Define the default permissions matrix matching the wireframe exactly
# Format: {role: {module: [allowed_actions]}}
#
# Wireframe table (Admin column = is_system_admin bypass, User column = what's seeded here):
# | Module        | Action           | Admin | User  |
# |---------------|------------------|-------|-------|
# | Sales         | view             | True  | True  |
# | Sales         | create           | True  | True  |
# | Sales         | edit             | True  | True  |
# | Sales         | delete           | True  | False | <- Only Admin deletes
# | Sales         | approve          | True  | False | <- Only Admin confirms SO
# | Purchase      | view             | True  | True  |
# | Purchase      | create           | True  | True  |
# | Purchase      | edit             | True  | True  |
# | Purchase      | approve          | True  | False | <- Only Admin confirms PO
# | Manufacturing | view             | True  | True  |
# | Manufacturing | production_entry | True  | True  |
# | Manufacturing | edit_bom         | True  | False | <- Only Admin edits BOM
# | Product       | view             | True  | True  |
# | Product       | create           | True  | True  |
# | Product       | edit             | True  | True  |

DEFAULT_PERMISSIONS = {
    # Sales role: view/create/edit on Sales (NO delete, NO approve), view on others
    RoleEnum.sales: {
        "Sales": ["view", "create", "edit"],  # NO delete, NO approve - Admin only
        "Purchase": ["view"],
        "Manufacturing": ["view"],
        "Product": ["view"],
        "BoM": ["view"],
        "AuditLog": ["view"],
    },
    # Purchase role: view/create/edit on Purchase (NO approve), view on others
    RoleEnum.purchase: {
        "Sales": ["view"],
        "Purchase": ["view", "create", "edit"],  # NO approve - Admin only
        "Manufacturing": ["view"],
        "Product": ["view"],
        "BoM": ["view"],
        "AuditLog": ["view"],
    },
    # Manufacturing role: view + production_entry on Manufacturing (NO edit_bom), view on others
    RoleEnum.manufacturing: {
        "Sales": ["view"],
        "Purchase": ["view"],
        "Manufacturing": ["view", "production_entry"],  # NO edit_bom - Admin only
        "Product": ["view"],
        "BoM": ["view"],
        "AuditLog": ["view"],
    },
    # Inventory role: view across the board
    RoleEnum.inventory: {
        "Sales": ["view"],
        "Purchase": ["view"],
        "Manufacturing": ["view"],
        "Product": ["view"],
        "BoM": ["view"],
        "AuditLog": ["view"],
    },
    # Owner role: Business Owner who "manages product"
    # Gets create/edit on Product, view-only on everything else, plus Dashboard
    RoleEnum.owner: {
        "Sales": ["view"],
        "Purchase": ["view"],
        "Manufacturing": ["view"],
        "Product": ["view", "create", "edit"],  # Owner manages product catalog
        "BoM": ["view"],
        "AuditLog": ["view"],
        "Dashboard": ["view"],
    },
}

# All possible actions across all modules
# Note: Manufacturing uses production_entry/edit_bom instead of create/edit
ALL_ACTIONS = [
    "view",
    "create",
    "edit",
    "delete",
    "approve",           # Gates SO/PO Confirm - Admin only, never granted to roles
    "production_entry",  # Manufacturing-specific: create production records
    "edit_bom",          # Manufacturing-specific: edit BOMs - Admin only
]

# All modules
ALL_MODULES = ["Sales", "Purchase", "Manufacturing", "Product", "BoM", "AuditLog", "Dashboard"]


def seed_role_permissions(db: Session) -> bool:
    """
    Seed the role_permissions table with default values if it's empty.

    Returns True if seeding was performed, False if table already had data.

    IMPORTANT: This function is idempotent - it only runs if the table is completely
    empty. It does NOT update existing permissions. To change permissions after
    initial seed, use the admin UI or direct database updates.
    """
    # Check if table already has data (idempotent check)
    existing_count = db.query(RolePermission).count()
    if existing_count > 0:
        return False

    permissions_to_create = []

    # Create permissions for each role based on DEFAULT_PERMISSIONS
    for role in RoleEnum:
        role_perms = DEFAULT_PERMISSIONS.get(role, {})

        for module in ALL_MODULES:
            allowed_actions = role_perms.get(module, [])

            for action in ALL_ACTIONS:
                # Create permission row - allowed only if explicitly in the allowed list
                permission = RolePermission(
                    role=role,
                    module=module,
                    action=action,
                    allowed=(action in allowed_actions)
                )
                permissions_to_create.append(permission)

    db.add_all(permissions_to_create)
    db.commit()

    return True


def get_permissions_summary(db: Session) -> dict:
    """
    Get a summary of all permissions for debugging/display.

    Returns a dict like:
    {
        "sales": {
            "Sales": ["view", "create", "edit"],
            "Purchase": ["view"],
            ...
        },
        ...
    }
    """
    permissions = db.query(RolePermission).filter(
        RolePermission.allowed == True
    ).all()

    summary = {}
    for perm in permissions:
        role_name = perm.role.value
        if role_name not in summary:
            summary[role_name] = {}
        if perm.module not in summary[role_name]:
            summary[role_name][perm.module] = []
        summary[role_name][perm.module].append(perm.action)

    return summary
