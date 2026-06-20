"""
Stock service — the single mutation point for ``Product.on_hand_qty``.

No route handler is allowed to write ``product.on_hand_qty`` directly. All
on-hand changes must go through :func:`adjust_stock`, which row-locks the
product, records a paired :class:`StockLedger` entry, and leaves the commit
to the caller's transaction boundary.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional, Union
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.manufacturing import ManufacturingOrder, MoComponent, MOStatusEnum
from app.models.product import Product
from app.models.purchase import POStatusEnum, PurchaseOrderLine
from app.models.sales import SalesOrder, SalesOrderLine, SOStatusEnum
from app.models.stock_ledger import LedgerMovementEnum, StockLedger


class StockError(Exception):
    """Base class for stock-service errors."""


class ProductNotFoundError(StockError):
    """Raised when the target product does not exist."""


class InsufficientStockError(StockError):
    """Raised when an adjustment would drive ``on_hand_qty`` below zero."""


def _coerce_movement(movement_type: Union[str, LedgerMovementEnum]) -> LedgerMovementEnum:
    if isinstance(movement_type, LedgerMovementEnum):
        return movement_type
    try:
        return LedgerMovementEnum(movement_type)
    except ValueError as exc:
        raise StockError(f"Unknown movement_type: {movement_type!r}") from exc


def adjust_stock(
    db: Session,
    product_id: UUID,
    qty_change: Decimal,
    movement_type: Union[str, LedgerMovementEnum],
    reference_type: str,
    reference_id: UUID,
    user_id: Optional[UUID],
) -> StockLedger:
    """
    Apply a single on-hand adjustment under a row lock and record the ledger.

    The caller owns the transaction: this function flushes but does not commit,
    so a cascading flow (e.g. one MO consuming several components) can batch
    many adjustments inside one outer transaction. The ``FOR UPDATE`` lock is
    held until that outer transaction commits or rolls back.
    """
    qty_change = Decimal(qty_change)

    product = (
        db.query(Product)
        .filter(Product.id == product_id)
        .populate_existing()
        .with_for_update()
        .one_or_none()
    )
    if product is None:
        raise ProductNotFoundError(f"Product {product_id} not found")

    qty_before = Decimal(product.on_hand_qty)
    qty_after = qty_before + qty_change

    if qty_after < 0:
        raise InsufficientStockError(
            f"Product {product_id}: on_hand {qty_before} + change {qty_change} "
            f"= {qty_after} would go negative"
        )

    product.on_hand_qty = qty_after

    ledger = StockLedger(
        product_id=product_id,
        movement_type=_coerce_movement(movement_type),
        qty_change=qty_change,
        qty_before=qty_before,
        qty_after=qty_after,
        reference_type=reference_type,
        reference_id=reference_id,
        created_by=user_id,
    )
    db.add(ledger)
    db.flush()
    return ledger


def get_product_stock(db: Session, product_id: UUID) -> dict:
    """
    Return live stock figures for a product.

    ``reserved_qty`` is computed from delivered/consumed quantities while the
    parent order is still active — *not* from the cached ``Product.reserved_qty``
    column. See the docstring at the bottom of the file for why we read
    ``delivered_qty`` rather than ``ordered_qty - delivered_qty``.
    """
    product = db.query(Product).filter(Product.id == product_id).one_or_none()
    if product is None:
        raise ProductNotFoundError(f"Product {product_id} not found")

    so_reserved = (
        db.query(func.coalesce(func.sum(SalesOrderLine.delivered_qty), 0))
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .filter(SalesOrderLine.product_id == product_id)
        .filter(
            SalesOrder.status.in_(
                (SOStatusEnum.confirmed, SOStatusEnum.partially_delivered)
            )
        )
        .scalar()
    )

    mo_reserved = (
        db.query(func.coalesce(func.sum(MoComponent.consumed_qty), 0))
        .join(ManufacturingOrder, ManufacturingOrder.id == MoComponent.mo_id)
        .filter(MoComponent.component_product_id == product_id)
        .filter(
            ManufacturingOrder.status.in_(
                (
                    MOStatusEnum.confirmed,
                    MOStatusEnum.in_progress,
                    MOStatusEnum.to_close,
                )
            )
        )
        .scalar()
    )

    on_hand_qty = Decimal(product.on_hand_qty)
    reserved_qty = Decimal(so_reserved or 0) + Decimal(mo_reserved or 0)
    return {
        "on_hand_qty": on_hand_qty,
        "reserved_qty": reserved_qty,
        "free_to_use_qty": on_hand_qty - reserved_qty,
    }


def get_sales_order_line_total(line: SalesOrderLine) -> Decimal:
    """
    Wireframe: "Total : Ordered Quantity * Sales Price (once delivered it
    should be delivered quantity * Sales Price)".
    """
    status = line.sales_order.status
    if status in (SOStatusEnum.draft, SOStatusEnum.confirmed):
        qty = Decimal(line.ordered_qty)
    else:
        qty = Decimal(line.delivered_qty)
    return qty * Decimal(line.sales_price)


def get_purchase_order_line_total(line: PurchaseOrderLine) -> Decimal:
    """Mirror of :func:`get_sales_order_line_total` for purchase lines."""
    status = line.purchase_order.status
    if status in (POStatusEnum.draft, POStatusEnum.confirmed):
        qty = Decimal(line.ordered_qty)
    else:
        qty = Decimal(line.received_qty)
    return qty * Decimal(line.cost_price)


# Why reserved_qty reads delivered_qty (not ordered_qty - delivered_qty):
# on_hand_qty only moves at FULLY terminal statuses. During a partial delivery
# the stock has not yet been decremented, so the delivered figure is exactly
# the amount currently "covering the gap" between the books and reality.
# The two numbers are meant to be read together — do not "fix" this formula.
