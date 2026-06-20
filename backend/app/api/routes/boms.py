"""
Bill of Materials CRUD routes.

Permissions:
  - GET /boms, GET /boms/{id}  →  require_permission("BoM", "view")
  - POST /boms, PATCH /boms/{id}, DELETE /boms/{id}  →  require_permission("Manufacturing", "edit_bom")
    (Admin-only per the wireframe permission matrix)
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import db_dependency, current_user_dependency, require_permission
from app.models.bom import BOM, BomLine, BomOperation
from app.models.manufacturing import ManufacturingOrder
from app.models.product import Product
from app.schemas.manufacturing_order import (
    BomCreateRequest,
    BomUpdateRequest,
    BomResponse,
    BomListResponse,
    BomLineResponse,
    BomOperationResponse,
    ProductBrief,
)
from app.schemas.product import BomOption
from app.services import audit_service

router = APIRouter(prefix="/boms", tags=["boms"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_next_bom_reference(db: Session) -> str:
    """Generate next BoM reference like BOM-000001, BOM-000002, etc."""
    from sqlalchemy import Integer
    max_num = db.query(
        func.max(
            func.cast(
                func.substr(BOM.reference, 5),
                Integer
            )
        )
    ).filter(BOM.reference.like("BOM-%")).scalar()
    next_num = (max_num or 0) + 1
    return f"BOM-{next_num:06d}"


def _build_bom_response(bom: BOM) -> BomResponse:
    return BomResponse(
        id=bom.id,
        reference=bom.reference,
        finished_product=ProductBrief(
            id=bom.finished_product.id,
            name=bom.finished_product.name,
        ),
        bom_lines=[
            BomLineResponse(
                id=line.id,
                component_product_id=line.component_product_id,
                component_product_name=line.component_product.name,
                qty_per_unit=line.qty_per_unit,
            )
            for line in bom.bom_lines
        ],
        bom_operations=[
            BomOperationResponse(
                id=op.id,
                sequence=op.sequence,
                operation_name=op.operation_name,
                work_center=op.work_center,
                expected_duration_min=op.expected_duration_min,
            )
            for op in sorted(bom.bom_operations, key=lambda o: o.sequence)
        ],
        created_at=bom.created_at,
    )


def _load_bom(db: Session, bom_id: UUID) -> BOM:
    bom = (
        db.query(BOM)
        .options(
            joinedload(BOM.finished_product),
            joinedload(BOM.bom_lines).joinedload(BomLine.component_product),
            joinedload(BOM.bom_operations),
        )
        .filter(BOM.id == bom_id)
        .first()
    )
    if not bom:
        raise HTTPException(status_code=404, detail="Bill of Materials not found")
    return bom


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=List[BomOption],
    dependencies=[Depends(require_permission("BoM", "view"))],
)
def list_boms_brief(db: db_dependency):
    """List BoMs (brief format for dropdowns). No auth beyond view."""
    return db.query(BOM).order_by(BOM.reference).all()


@router.get(
    "/list",
    response_model=List[BomListResponse],
    dependencies=[Depends(require_permission("BoM", "view"))],
)
def list_boms(db: db_dependency, product_id: Optional[UUID] = None):
    """List all BoMs with detail. Optionally filter by finished_product_id."""
    query = (
        db.query(BOM)
        .options(
            joinedload(BOM.finished_product),
            joinedload(BOM.bom_lines),
            joinedload(BOM.bom_operations),
        )
    )
    if product_id:
        query = query.filter(BOM.finished_product_id == product_id)

    boms = query.order_by(BOM.reference).all()
    result = []
    for bom in boms:
        result.append(BomListResponse(
            id=bom.id,
            reference=bom.reference,
            finished_product_id=bom.finished_product_id,
            finished_product_name=bom.finished_product.name if bom.finished_product else "(deleted)",
            bom_lines_count=len(bom.bom_lines),
            bom_operations_count=len(bom.bom_operations),
            created_at=bom.created_at,
        ))
    return result


@router.get(
    "/{bom_id}",
    response_model=BomResponse,
    dependencies=[Depends(require_permission("BoM", "view"))],
)
def get_bom(bom_id: UUID, db: db_dependency):
    """Get a single BoM with all lines and operations."""
    return _build_bom_response(_load_bom(db, bom_id))


@router.post(
    "/",
    response_model=BomResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("Manufacturing", "edit_bom"))],
)
def create_bom(
    request: BomCreateRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """Create a new Bill of Materials. Admin-only."""
    # Validate finished product
    product = db.query(Product).filter(Product.id == request.finished_product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Finished product not found")

    # Validate all component products exist
    for line in request.bom_lines:
        comp = db.query(Product).filter(Product.id == line.component_product_id).first()
        if not comp:
            raise HTTPException(
                status_code=404,
                detail=f"Component product {line.component_product_id} not found"
            )

    reference = _get_next_bom_reference(db)

    bom = BOM(
        reference=reference,
        finished_product_id=request.finished_product_id,
    )
    db.add(bom)
    db.flush()  # get bom.id

    for line_data in request.bom_lines:
        db.add(BomLine(
            bom_id=bom.id,
            component_product_id=line_data.component_product_id,
            qty_per_unit=line_data.qty_per_unit,
        ))

    for op_data in request.bom_operations:
        db.add(BomOperation(
            bom_id=bom.id,
            sequence=op_data.sequence,
            operation_name=op_data.operation_name,
            work_center=op_data.work_center,
            expected_duration_min=op_data.expected_duration_min,
        ))

    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="BoM",
        record_type="BOM",
        record_id=bom.id,
        action="created",
    )

    db.commit()
    return _build_bom_response(_load_bom(db, bom.id))


@router.patch(
    "/{bom_id}",
    response_model=BomResponse,
    dependencies=[Depends(require_permission("Manufacturing", "edit_bom"))],
)
def update_bom(
    bom_id: UUID,
    request: BomUpdateRequest,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """Update a BoM. Lines and operations are fully replaced if provided. Admin-only."""
    bom = _load_bom(db, bom_id)

    update_data = request.model_dump(exclude_unset=True)

    if "finished_product_id" in update_data:
        product = db.query(Product).filter(Product.id == update_data["finished_product_id"]).first()
        if not product:
            raise HTTPException(status_code=404, detail="Finished product not found")
        old_val = str(bom.finished_product_id)
        bom.finished_product_id = update_data["finished_product_id"]
        audit_service.log_change(
            db, user_id=current_user.id, module="BoM", record_type="BOM",
            record_id=bom.id, action="updated", field_changed="finished_product_id",
            old_value=old_val, new_value=str(bom.finished_product_id),
        )

    if "bom_lines" in update_data and update_data["bom_lines"] is not None:
        # Validate all component products
        for line_data in update_data["bom_lines"]:
            comp = db.query(Product).filter(Product.id == line_data["component_product_id"]).first()
            if not comp:
                raise HTTPException(
                    status_code=404,
                    detail=f"Component product {line_data['component_product_id']} not found"
                )
        # Delete all existing lines
        for line in list(bom.bom_lines):
            db.delete(line)
        db.flush()
        # Re-create
        for line_data in update_data["bom_lines"]:
            db.add(BomLine(
                bom_id=bom.id,
                component_product_id=line_data["component_product_id"],
                qty_per_unit=line_data["qty_per_unit"],
            ))
        audit_service.log_change(
            db, user_id=current_user.id, module="BoM", record_type="BOM",
            record_id=bom.id, action="updated", field_changed="bom_lines",
        )

    if "bom_operations" in update_data and update_data["bom_operations"] is not None:
        for op in list(bom.bom_operations):
            db.delete(op)
        db.flush()
        for op_data in update_data["bom_operations"]:
            db.add(BomOperation(
                bom_id=bom.id,
                sequence=op_data["sequence"],
                operation_name=op_data["operation_name"],
                work_center=op_data["work_center"],
                expected_duration_min=op_data["expected_duration_min"],
            ))
        audit_service.log_change(
            db, user_id=current_user.id, module="BoM", record_type="BOM",
            record_id=bom.id, action="updated", field_changed="bom_operations",
        )

    db.commit()
    return _build_bom_response(_load_bom(db, bom_id))


@router.delete(
    "/{bom_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("Manufacturing", "edit_bom"))],
)
def delete_bom(
    bom_id: UUID,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """Delete a BoM. Only allowed if no Manufacturing Orders reference it. Admin-only."""
    bom = _load_bom(db, bom_id)

    # Check if any MO references this BoM
    mo_count = db.query(ManufacturingOrder).filter(ManufacturingOrder.bom_id == bom_id).count()
    if mo_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete BoM: {mo_count} Manufacturing Order(s) reference it"
        )

    audit_service.log_change(
        db,
        user_id=current_user.id,
        module="BoM",
        record_type="BOM",
        record_id=bom.id,
        action="deleted",
    )

    db.delete(bom)
    db.commit()
    return None
