from fastapi import APIRouter
from typing import List, Dict, Any
from decimal import Decimal
from datetime import datetime, timedelta

from sqlalchemy import func
from app.api.dependencies import db_dependency, current_user_dependency
from app.models.product import Product, ProductTypeEnum
from app.models.sales import SalesOrder, SalesOrderLine, SOStatusEnum
from app.models.purchase import PurchaseOrder, PurchaseOrderLine, POStatusEnum
from app.models.manufacturing import ManufacturingOrder, MoComponent, WorkOrder, MOStatusEnum
from app.models.bom import BOM, BomLine

router = APIRouter(prefix="/ai", tags=["ai"])


def _safe_float(val) -> float:
    if val is None:
        return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


@router.get("/demand-forecast")
def get_demand_forecast(
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Dynamic AI demand forecasting. Computes real shortage risk from live stock
    levels and pending (confirmed) sales order quantities per product.
    """
    # --- Confirmed SO demand aggregated per product ---
    pending_demand = (
        db.query(
            SalesOrderLine.product_id,
            func.sum(SalesOrderLine.ordered_qty - SalesOrderLine.delivered_qty).label("pending_qty"),
        )
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .filter(SalesOrder.status.in_([SOStatusEnum.confirmed, SOStatusEnum.partially_delivered]))
        .group_by(SalesOrderLine.product_id)
        .all()
    )
    pending_map: Dict[str, float] = {str(r.product_id): _safe_float(r.pending_qty) for r in pending_demand}

    # --- In-progress / draft MO quantities per finished product ---
    active_mo_qty = (
        db.query(
            ManufacturingOrder.finished_product_id,
            func.sum(ManufacturingOrder.quantity).label("mo_qty"),
        )
        .filter(ManufacturingOrder.status.in_([MOStatusEnum.draft, MOStatusEnum.confirmed, MOStatusEnum.in_progress]))
        .group_by(ManufacturingOrder.finished_product_id)
        .all()
    )
    mo_map: Dict[str, float] = {str(r.finished_product_id): _safe_float(r.mo_qty) for r in active_mo_qty}

    # --- In-flight PO quantities per component product ---
    inbound_po_qty = (
        db.query(
            PurchaseOrderLine.product_id,
            func.sum(PurchaseOrderLine.ordered_qty - PurchaseOrderLine.received_qty).label("inbound"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .filter(PurchaseOrder.status.in_([POStatusEnum.draft, POStatusEnum.confirmed, POStatusEnum.partially_received]))
        .group_by(PurchaseOrderLine.product_id)
        .all()
    )
    inbound_map: Dict[str, float] = {str(r.product_id): _safe_float(r.inbound) for r in inbound_po_qty}

    # --- Build forecasts for all products ---
    products = db.query(Product).filter(Product.on_hand_qty >= 0).all()

    forecasts = []
    for p in products:
        pid = str(p.id)
        on_hand = _safe_float(p.on_hand_qty)
        reserved = _safe_float(p.reserved_qty)
        free_stock = max(0.0, on_hand - reserved)

        # Estimate 30-day demand: pending sales demand + historical pace (MO qty proxy)
        pending = pending_map.get(pid, 0.0)
        mo_activity = mo_map.get(pid, 0.0)
        inbound = inbound_map.get(pid, 0.0)

        # Predicted demand = confirmed pending + 20% buffer for forecast window
        predicted_30d = round(pending * 1.2 + mo_activity * 0.5, 1)

        if predicted_30d == 0 and on_hand == 0:
            continue  # Skip products with no activity

        # Effective supply: free stock + inbound
        effective_supply = free_stock + inbound

        # Shortage probability calculation
        if predicted_30d == 0:
            shortage_prob = 0.0
        elif effective_supply >= predicted_30d * 1.5:
            shortage_prob = 0.05
        elif effective_supply >= predicted_30d:
            shortage_prob = 0.25
        elif effective_supply >= predicted_30d * 0.5:
            shortage_prob = 0.65
        else:
            shortage_prob = min(0.98, 0.80 + (1.0 - min(effective_supply / max(predicted_30d, 1), 1.0)) * 0.18)

        # Derive AI reasoning
        reasons = []
        if pending > 0:
            reasons.append(f"{pending:.0f} units pending in confirmed sales orders")
        if inbound > 0:
            reasons.append(f"{inbound:.0f} units inbound via open purchase orders")
        if mo_activity > 0:
            reasons.append(f"{mo_activity:.0f} units queued in active manufacturing orders")
        if reserved > 0:
            reasons.append(f"{reserved:.0f} units reserved (not freely available)")

        if shortage_prob > 0.8:
            recommendation = f"Critical shortage risk — initiate emergency replenishment. Free stock ({free_stock:.0f}) covers only {round(free_stock/max(predicted_30d,1)*100)}% of 30-day demand."
        elif shortage_prob > 0.6:
            recommendation = f"Elevated risk — plan purchase or manufacturing order soon. Demand ({predicted_30d:.0f} units) approaches supply ({effective_supply:.0f} units)."
        elif shortage_prob > 0.2:
            recommendation = f"Monitor closely — supply ({effective_supply:.0f}) slightly exceeds demand ({predicted_30d:.0f}), but buffer is thin."
        else:
            recommendation = f"Stock levels healthy — {effective_supply:.0f} units available against {predicted_30d:.0f} units predicted demand. No action needed."

        forecasts.append({
            "product_id": pid,
            "product_name": p.name,
            "product_type": p.product_type.value if p.product_type else "unknown",
            "current_stock": round(on_hand, 2),
            "free_stock": round(free_stock, 2),
            "reserved_qty": round(reserved, 2),
            "inbound_qty": round(inbound, 2),
            "pending_demand": round(pending, 2),
            "predicted_demand_30d": predicted_30d,
            "shortage_probability": round(shortage_prob, 2),
            "recommendation": recommendation,
            "reasoning": reasons if reasons else ["No active demand signals detected"],
        })

    # Sort: highest shortage risk first, then only show top 8
    forecasts.sort(key=lambda x: x["shortage_probability"], reverse=True)
    forecasts = forecasts[:8]

    # Compute overall trend
    high_risk = sum(1 for f in forecasts if f["shortage_probability"] > 0.6)
    total_pending = sum(pending_map.values())
    if high_risk >= 3:
        trend = f"⚠️ High pressure — {high_risk} products face critical shortage risk with {total_pending:.0f} units in unfulfilled demand"
    elif high_risk >= 1:
        trend = f"📈 Moderate demand — {high_risk} product(s) approaching shortage threshold; {total_pending:.0f} units pending delivery"
    elif total_pending > 0:
        trend = f"✅ Demand healthy — {total_pending:.0f} units pending across confirmed orders; stock levels adequate"
    else:
        trend = "📊 No confirmed demand detected — system at steady state"

    return {
        "status": "success",
        "forecasts": forecasts,
        "overall_trend": trend,
        "computed_at": datetime.utcnow().isoformat(),
    }


@router.get("/anomalies")
def get_anomalies(
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Dynamic anomaly detection derived from real database signals.
    Flags work order failures, overdue MOs, blocked POs, and idle stock.
    """
    anomalies = []
    now = datetime.utcnow()
    cutoff_48h = now - timedelta(hours=48)
    cutoff_7d = now - timedelta(days=7)

    # --- Anomaly 1: Failed Work Orders (QC failures) ---
    failed_wo = (
        db.query(WorkOrder)
        .filter(WorkOrder.pass_fail == "fail")
        .all()
    )
    if failed_wo:
        work_centers = list(set(wo.work_center for wo in failed_wo))
        ops = list(set(wo.operation_name for wo in failed_wo))
        anomalies.append({
            "id": "AN-QC-001",
            "type": "Quality Control",
            "severity": "High" if len(failed_wo) >= 3 else "Medium",
            "description": (
                f"{len(failed_wo)} work order(s) marked FAIL across "
                f"{len(work_centers)} work center(s): {', '.join(work_centers[:3])}. "
                f"Operations affected: {', '.join(ops[:3])}."
            ),
            "affected_modules": ["Manufacturing"],
            "reasoning": (
                f"Work orders with pass_fail='fail' indicate defective output at the production stage. "
                f"Each failed unit represents wasted materials and labour. "
                f"Affected operations ({', '.join(ops[:3])}) should be inspected immediately for root cause."
            ),
            "metric": f"{len(failed_wo)} failed WO(s)",
        })

    # --- Anomaly 2: Long-stalled Manufacturing Orders ---
    stalled_mos = (
        db.query(ManufacturingOrder)
        .filter(
            ManufacturingOrder.status.in_([MOStatusEnum.confirmed, MOStatusEnum.in_progress]),
            ManufacturingOrder.created_at <= cutoff_7d,
        )
        .all()
    )
    if stalled_mos:
        refs = [mo.reference for mo in stalled_mos[:5]]
        avg_age = sum((now - mo.created_at.replace(tzinfo=None)).days for mo in stalled_mos) / len(stalled_mos)
        anomalies.append({
            "id": "AN-MFG-002",
            "type": "Production Delay",
            "severity": "High" if avg_age > 14 else "Medium",
            "description": (
                f"{len(stalled_mos)} manufacturing order(s) have been active for over 7 days without completion. "
                f"Average age: {avg_age:.0f} days. Orders: {', '.join(refs)}."
            ),
            "affected_modules": ["Manufacturing"],
            "reasoning": (
                f"MOs in 'confirmed' or 'in_progress' state for >{avg_age:.0f} days on average signal a production bottleneck. "
                f"This could be due to component shortages, work center unavailability, or missing assignees. "
                f"Delayed MOs block inventory replenishment and can cascade into delayed sales deliveries."
            ),
            "metric": f"{len(stalled_mos)} stalled MO(s) — avg {avg_age:.0f} days old",
        })

    # --- Anomaly 3: Overdue Purchase Orders ---
    today = now.date()
    overdue_pos = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.status.in_([POStatusEnum.confirmed, POStatusEnum.partially_received]),
            PurchaseOrder.expected_delivery_date != None,
            PurchaseOrder.expected_delivery_date < today,
        )
        .all()
    )
    if overdue_pos:
        refs = [po.reference for po in overdue_pos[:5]]
        anomalies.append({
            "id": "AN-PO-003",
            "type": "Supply Chain Delay",
            "severity": "High" if len(overdue_pos) >= 2 else "Medium",
            "description": (
                f"{len(overdue_pos)} purchase order(s) are past their expected delivery date without full receipt. "
                f"Orders: {', '.join(refs)}."
            ),
            "affected_modules": ["Purchase", "Manufacturing"],
            "reasoning": (
                f"Overdue POs mean components have not arrived on time. "
                f"This directly blocks any manufacturing orders waiting on those components, "
                f"creating a downstream ripple that delays finished goods production and sales deliveries. "
                f"Contact the vendor(s) immediately for status updates."
            ),
            "metric": f"{len(overdue_pos)} overdue PO(s)",
        })

    # --- Anomaly 4: Components with zero stock but active MO demand ---
    # Find all component products needed by active MOs
    active_mo_components = (
        db.query(MoComponent.component_product_id, func.sum(MoComponent.to_consume - MoComponent.consumed_qty).label("needed"))
        .join(ManufacturingOrder, ManufacturingOrder.id == MoComponent.mo_id)
        .filter(ManufacturingOrder.status.in_([MOStatusEnum.confirmed, MOStatusEnum.in_progress]))
        .group_by(MoComponent.component_product_id)
        .all()
    )
    blocked_components = []
    for comp_id, needed in active_mo_components:
        prod = db.query(Product).filter(Product.id == comp_id).first()
        if prod and _safe_float(prod.on_hand_qty) < _safe_float(needed):
            blocked_components.append({
                "name": prod.name,
                "on_hand": _safe_float(prod.on_hand_qty),
                "needed": _safe_float(needed),
            })
    if blocked_components:
        names = [c["name"] for c in blocked_components[:4]]
        anomalies.append({
            "id": "AN-STK-004",
            "type": "Component Stock-out",
            "severity": "High",
            "description": (
                f"{len(blocked_components)} component(s) have insufficient stock for active manufacturing orders: "
                f"{', '.join(names)}."
            ),
            "affected_modules": ["Manufacturing", "Purchase"],
            "reasoning": (
                f"Active MOs require these components but on-hand quantities are insufficient. "
                f"Without immediate restocking, production will halt. "
                f"The system should auto-trigger purchase orders for the shortfall quantities. "
                f"Components flagged: " + "; ".join(
                    f"{c['name']} (need {c['needed']:.1f}, have {c['on_hand']:.1f})"
                    for c in blocked_components[:4]
                )
            ),
            "metric": f"{len(blocked_components)} blocked component(s)",
        })

    # --- Anomaly 5: Idle finished goods (high stock, no recent sales) ---
    idle_products = []
    fin_goods = db.query(Product).filter(
        Product.product_type == ProductTypeEnum.finished_good,
        Product.on_hand_qty > 0,
    ).all()
    recent_demand_pids = set(
        str(r.product_id) for r in (
            db.query(SalesOrderLine.product_id)
            .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
            .filter(SalesOrder.created_at >= cutoff_7d)
            .all()
        )
    )
    for p in fin_goods:
        if str(p.id) not in recent_demand_pids and _safe_float(p.on_hand_qty) > 10:
            idle_products.append({"name": p.name, "stock": _safe_float(p.on_hand_qty)})

    if idle_products:
        names = [f"{p['name']} ({p['stock']:.0f} units)" for p in idle_products[:4]]
        anomalies.append({
            "id": "AN-INV-005",
            "type": "Idle Inventory",
            "severity": "Low",
            "description": (
                f"{len(idle_products)} finished good(s) have significant stock but no sales activity in the past 7 days: "
                f"{', '.join([p['name'] for p in idle_products[:3]])}."
            ),
            "affected_modules": ["Sales", "Manufacturing"],
            "reasoning": (
                f"High on-hand stock with no recent demand indicates potential overproduction or slow-moving SKUs. "
                f"This ties up working capital and warehouse space. "
                f"Consider pricing promotions or suspending further manufacturing runs until inventory clears. "
                f"Affected: {', '.join(names)}."
            ),
            "metric": f"{len(idle_products)} idle SKU(s)",
        })

    # If no real anomalies, return a healthy-state message
    if not anomalies:
        anomalies.append({
            "id": "AN-000",
            "type": "System Health",
            "severity": "None",
            "description": "All systems operating within normal parameters. No anomalies detected.",
            "affected_modules": [],
            "reasoning": (
                "The AI engine scanned quality control records, production timelines, "
                "purchase order delivery dates, component availability, and inventory turnover. "
                "No significant deviations from expected operational baselines were found."
            ),
            "metric": "0 issues",
        })

    return {
        "status": "success",
        "anomalies": anomalies,
        "computed_at": datetime.utcnow().isoformat(),
    }
