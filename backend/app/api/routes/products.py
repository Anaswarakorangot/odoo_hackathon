from decimal import Decimal
from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import (
    current_user_dependency,
    db_dependency,
    require_permission,
    require_product_view_or_sales,
)
from app.models.bom import BOM
from app.models.manufacturing import ManufacturingOrder, MOStatusEnum, MoComponent
from app.models.product import ProcurementTypeEnum, Product as ProductModel, ProductTypeEnum
from app.models.purchase import POStatusEnum, PurchaseOrder, PurchaseOrderLine
from app.models.sales import SalesOrder, SalesOrderLine, SOStatusEnum
from app.models.user import User
from app.models.vendor_customer import Vendor
from app.schemas.product import (
    Product,
    ProductCreate,
    ProductStock,
    ProductUpdate,
)
from app.services import audit_service
from app.services.stock_service import get_product_stock


router = APIRouter(prefix="/products", tags=["products"])


# ---------------------------------------------------------------------------
# Helpers


def _to_response(p: ProductModel) -> Product:
    """Materialise a Product model into the API response shape.

    Uses the cached ``reserved_qty`` column for list/detail responses. The
    live recomputed figures live behind ``GET /products/{id}/stock``.
    """
    return Product(
        id=p.id,
        name=p.name,
        product_type=p.product_type,
        sales_price=p.sales_price,
        cost_price=p.cost_price,
        procure_on_demand=p.procure_on_demand,
        procurement_type=p.procurement_type,
        vendor_id=p.vendor_id,
        default_bom_id=p.default_bom_id,
        on_hand_qty=p.on_hand_qty,
        reserved_qty=p.reserved_qty,
        free_to_use_qty=Decimal(p.on_hand_qty) - Decimal(p.reserved_qty),
    )


def _validate_procurement_fields(
    db: Session,
    *,
    procure_on_demand: bool,
    procurement_type,
    vendor_id,
    default_bom_id,
) -> List[dict]:
    """Apply the literal wireframe rules for procurement metadata."""
    errors: List[dict] = []

    if procure_on_demand:
        if procurement_type is None:
            errors.append(
                {
                    "field": "procurement_type",
                    "message": "procurement_type is required when procure_on_demand is true",
                }
            )
        elif procurement_type == ProcurementTypeEnum.purchase:
            if vendor_id is None:
                errors.append(
                    {
                        "field": "vendor_id",
                        "message": "vendor_id is required when procurement_type is 'purchase'",
                    }
                )
            elif not db.query(Vendor).filter(Vendor.id == vendor_id).first():
                errors.append({"field": "vendor_id", "message": "vendor not found"})

            if default_bom_id is not None:
                errors.append(
                    {
                        "field": "default_bom_id",
                        "message": "default_bom_id must not be set when procurement_type is 'purchase'",
                    }
                )
        elif procurement_type == ProcurementTypeEnum.manufacturing:
            if default_bom_id is None:
                errors.append(
                    {
                        "field": "default_bom_id",
                        "message": "default_bom_id is required when procurement_type is 'manufacturing'",
                    }
                )
            elif not db.query(BOM).filter(BOM.id == default_bom_id).first():
                errors.append({"field": "default_bom_id", "message": "BoM not found"})

            if vendor_id is not None:
                errors.append(
                    {
                        "field": "vendor_id",
                        "message": "vendor_id must not be set when procurement_type is 'manufacturing'",
                    }
                )
    else:
        # procure_on_demand false: none of the procurement fields should be set
        if procurement_type is not None:
            errors.append(
                {
                    "field": "procurement_type",
                    "message": "procurement_type must not be set when procure_on_demand is false",
                }
            )
        if vendor_id is not None:
            errors.append(
                {
                    "field": "vendor_id",
                    "message": "vendor_id must not be set when procure_on_demand is false",
                }
            )
        if default_bom_id is not None:
            errors.append(
                {
                    "field": "default_bom_id",
                    "message": "default_bom_id must not be set when procure_on_demand is false",
                }
            )

    return errors


def _product_in_use(db: Session, product_id: UUID) -> bool:
    """True if the product is referenced by any non-cancelled SO/PO/MO."""
    so_active = (
        db.query(SalesOrderLine.id)
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .filter(SalesOrderLine.product_id == product_id)
        .filter(SalesOrder.status != SOStatusEnum.cancelled)
        .first()
    )
    if so_active:
        return True

    po_active = (
        db.query(PurchaseOrderLine.id)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .filter(PurchaseOrderLine.product_id == product_id)
        .filter(PurchaseOrder.status != POStatusEnum.cancelled)
        .first()
    )
    if po_active:
        return True

    mo_finished = (
        db.query(ManufacturingOrder.id)
        .filter(ManufacturingOrder.finished_product_id == product_id)
        .filter(ManufacturingOrder.status != MOStatusEnum.cancelled)
        .first()
    )
    if mo_finished:
        return True

    mo_component = (
        db.query(MoComponent.id)
        .join(ManufacturingOrder, ManufacturingOrder.id == MoComponent.mo_id)
        .filter(MoComponent.component_product_id == product_id)
        .filter(ManufacturingOrder.status != MOStatusEnum.cancelled)
        .first()
    )
    return mo_component is not None


# ---------------------------------------------------------------------------
# Routes


@router.post(
    "",
    response_model=Product,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    payload: ProductCreate,
    db: db_dependency,
    user: Annotated[User, Depends(require_permission("Product", "create"))],
):
    errors: List[dict] = []

    if db.query(ProductModel).filter(ProductModel.name == payload.name).first():
        errors.append({"field": "name", "message": "name is already taken"})

    errors.extend(
        _validate_procurement_fields(
            db,
            procure_on_demand=payload.procure_on_demand,
            procurement_type=payload.procurement_type,
            vendor_id=payload.vendor_id,
            default_bom_id=payload.default_bom_id,
        )
    )

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=errors
        )

    product = ProductModel(
        name=payload.name,
        product_type=payload.product_type,
        sales_price=payload.sales_price,
        cost_price=payload.cost_price,
        procure_on_demand=payload.procure_on_demand,
        procurement_type=payload.procurement_type,
        vendor_id=payload.vendor_id,
        default_bom_id=payload.default_bom_id,
    )
    db.add(product)
    db.flush()  # populate product.id

    audit_service.log_change(
        db,
        user_id=user.id,
        module="Product",
        record_type="Product",
        record_id=product.id,
        action="created",
    )
    db.commit()
    db.refresh(product)
    return _to_response(product)


@router.get("", response_model=List[Product])
def list_products(
    db: db_dependency,
    _: Annotated[User, Depends(require_product_view_or_sales)],
    type: str | None = None,  # e.g. ?type=finished_good
):
    q = db.query(ProductModel)
    if type:
        # Map query param string to enum value safely
        try:
            type_enum = ProductTypeEnum(type)
            q = q.filter(ProductModel.product_type == type_enum)
        except ValueError:
            pass  # unknown type param — return all
    products = q.order_by(ProductModel.name).all()
    return [_to_response(p) for p in products]


@router.get("/{product_id}", response_model=Product)
def get_product(
    product_id: UUID,
    db: db_dependency,
    _: Annotated[User, Depends(require_product_view_or_sales)],
):
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return _to_response(product)


@router.get("/{product_id}/stock", response_model=ProductStock)
def get_stock(
    product_id: UUID,
    db: db_dependency,
    _: Annotated[User, Depends(require_product_view_or_sales)],
):
    if not db.query(ProductModel.id).filter(ProductModel.id == product_id).first():
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductStock(**get_product_stock(db, product_id))


@router.patch("/{product_id}", response_model=Product)
def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    db: db_dependency,
    user: Annotated[User, Depends(require_permission("Product", "edit"))],
):
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = payload.model_dump(exclude_unset=True)
    errors: List[dict] = []

    # name is immutable — the spec calls it the unique identifier
    if "name" in update_data:
        errors.append(
            {"field": "name", "message": "name cannot be changed once a product exists"}
        )

    # mode flip guard once the product is in stock
    on_hand = Decimal(product.on_hand_qty)
    mode_changing = (
        ("procure_on_demand" in update_data and update_data["procure_on_demand"] != product.procure_on_demand)
        or ("procurement_type" in update_data and update_data["procurement_type"] != product.procurement_type)
    )
    if mode_changing and on_hand > 0:
        errors.append(
            {
                "field": "procure_on_demand",
                "message": (
                    "cannot change procurement mode while on_hand_qty > 0; "
                    "drain stock first"
                ),
            }
        )

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=errors
        )

    # Materialise the merged future state for cross-field validation.
    procure_on_demand = update_data.get("procure_on_demand", product.procure_on_demand)
    procurement_type = update_data.get("procurement_type", product.procurement_type)
    vendor_id = update_data.get("vendor_id", product.vendor_id)
    default_bom_id = update_data.get("default_bom_id", product.default_bom_id)
    cross_errors = _validate_procurement_fields(
        db,
        procure_on_demand=procure_on_demand,
        procurement_type=procurement_type,
        vendor_id=vendor_id,
        default_bom_id=default_bom_id,
    )
    if cross_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=cross_errors
        )

    # Apply + audit per changed field.
    for field, new_value in update_data.items():
        old_value = getattr(product, field)
        if old_value == new_value:
            continue
        setattr(product, field, new_value)
        audit_service.log_change(
            db,
            user_id=user.id,
            module="Product",
            record_type="Product",
            record_id=product.id,
            action="updated",
            field_changed=field,
            old_value=old_value,
            new_value=new_value,
        )

    db.commit()
    db.refresh(product)
    return _to_response(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: UUID,
    db: db_dependency,
    user: Annotated[User, Depends(require_permission("Product", "delete"))],
):
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if Decimal(product.on_hand_qty) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete product in stock. Stock must be zero.",
        )
    if _product_in_use(db, product_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete product referenced by active orders.",
        )

    audit_service.log_change(
        db,
        user_id=user.id,
        module="Product",
        record_type="Product",
        record_id=product.id,
        action="deleted",
    )
    db.delete(product)
    db.commit()
    return None
