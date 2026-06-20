"""
Recall/Batch Lookup routes.

This implements the v_recall_lookup functionality: given a defective batch number,
find all Manufacturing Orders that consumed components from that batch, and trace
back to the Sales Orders (customers) that received products made from those MOs.

This is a key differentiator for automotive ERP - "no furniture ERP has this."
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import db_dependency, current_user_dependency
from app.models.manufacturing import ManufacturingOrder, MoComponent
from app.models.product import Product
from app.models.sales import SalesOrder

router = APIRouter(prefix="/recall", tags=["recall"])


class RecallLookupResult(BaseModel):
    """Single result from a batch recall lookup."""
    mo_id: UUID
    mo_reference: str
    vin_number: Optional[str]
    component_name: str
    batch_number: str
    consumed_qty: float
    # Traceability back to customer
    source_sales_order_id: Optional[UUID]
    source_sales_order_ref: Optional[str]
    customer_name: Optional[str]

    class Config:
        from_attributes = True


class RecallLookupResponse(BaseModel):
    """Response containing all affected MOs/SOs for a batch."""
    batch_number: str
    affected_count: int
    results: List[RecallLookupResult]


@router.get("/lookup", response_model=RecallLookupResponse)
def batch_recall_lookup(
    batch_number: str = Query(..., min_length=1, description="Batch number to look up"),
    db: db_dependency = None,
    current_user: current_user_dependency = None,
):
    """
    Look up which Manufacturing Orders consumed components from a given batch.

    This is the core recall management feature: if a supplier reports a defective
    batch of components (e.g., "batch BF-2024-0042 of brake pads has a defect"),
    this endpoint returns:

    - All MOs that used components from that batch
    - The VIN numbers of vehicles produced by those MOs
    - The Sales Orders (and customers) that ordered those vehicles

    This allows immediate identification of affected customers for recall notification.
    """
    # Query mo_components with the given batch_number, joining to MO and Product
    components = (
        db.query(MoComponent)
        .filter(MoComponent.batch_number == batch_number)
        .options(
            joinedload(MoComponent.manufacturing_order).joinedload(ManufacturingOrder.source_sales_order).joinedload(SalesOrder.customer),
            joinedload(MoComponent.component_product),
        )
        .all()
    )

    results = []
    for comp in components:
        mo = comp.manufacturing_order
        so = mo.source_sales_order if mo else None
        customer = so.customer if so else None

        results.append(RecallLookupResult(
            mo_id=mo.id,
            mo_reference=mo.reference,
            vin_number=mo.vin_number,
            component_name=comp.component_product.name,
            batch_number=comp.batch_number,
            consumed_qty=float(comp.consumed_qty),
            source_sales_order_id=so.id if so else None,
            source_sales_order_ref=so.reference if so else None,
            customer_name=customer.name if customer else None,
        ))

    return RecallLookupResponse(
        batch_number=batch_number,
        affected_count=len(results),
        results=results,
    )


@router.get("/batches", response_model=List[str])
def list_batches(
    db: db_dependency,
    current_user: current_user_dependency,
    search: Optional[str] = None,
):
    """
    List all known batch numbers in the system.

    Useful for autocomplete in the recall lookup UI.
    """
    query = db.query(MoComponent.batch_number).filter(MoComponent.batch_number.isnot(None)).distinct()

    if search:
        query = query.filter(MoComponent.batch_number.ilike(f"%{search}%"))

    batches = [row[0] for row in query.order_by(MoComponent.batch_number).limit(50).all()]
    return batches
