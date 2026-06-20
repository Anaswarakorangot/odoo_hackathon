"""
Thin vendor list endpoint to feed the Products form dropdown.
Full vendor CRUD belongs to its own slice; this is intentionally minimal.
"""

from typing import Annotated, List

from fastapi import APIRouter, Depends

from app.api.dependencies import db_dependency, require_permission
from app.models.user import User
from app.models.vendor_customer import Vendor
from app.schemas.product import VendorOption


router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("", response_model=List[VendorOption])
def list_vendors(
    db: db_dependency,
    _: Annotated[User, Depends(require_permission("Purchase", "view"))],
):
    return db.query(Vendor).order_by(Vendor.name).all()
