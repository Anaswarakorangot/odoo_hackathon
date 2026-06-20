"""
Thin BoM list endpoint to feed the Products form dropdown.
Full BoM CRUD belongs to its own slice; this is intentionally minimal.
"""

from typing import Annotated, List

from fastapi import APIRouter, Depends

from app.api.dependencies import db_dependency, require_permission
from app.models.bom import BOM
from app.models.user import User
from app.schemas.product import BomOption


router = APIRouter(prefix="/boms", tags=["boms"])


@router.get("", response_model=List[BomOption])
def list_boms(
    db: db_dependency,
    _: Annotated[User, Depends(require_permission("BoM", "view"))],
):
    return db.query(BOM).order_by(BOM.reference).all()
