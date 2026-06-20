from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from app.api.dependencies import db_dependency, current_user_dependency, require_permission

router = APIRouter(prefix="/ai", tags=["ai"])

@router.get("/demand-forecast")
def get_demand_forecast(
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Returns simulated AI demand forecasting data for products.
    """
    return {
        "status": "success",
        "forecasts": [
            {
                "product_name": "Premium Leather Seats",
                "current_stock": 42,
                "predicted_demand_30d": 120,
                "shortage_probability": 0.85,
                "recommendation": "Initiate purchase order within 3 days"
            },
            {
                "product_name": "V8 Engine Block",
                "current_stock": 15,
                "predicted_demand_30d": 12,
                "shortage_probability": 0.10,
                "recommendation": "Stock levels optimal"
            },
            {
                "product_name": "All-Weather Tires (Set of 4)",
                "current_stock": 200,
                "predicted_demand_30d": 350,
                "shortage_probability": 0.95,
                "recommendation": "Critical: Reorder immediately"
            }
        ],
        "overall_trend": "Increasing demand in Q3"
    }

@router.get("/anomalies")
def get_anomalies(
    db: db_dependency,
    current_user: current_user_dependency,
):
    """
    Returns simulated AI anomaly detection data.
    """
    return {
        "status": "success",
        "anomalies": [
            {
                "id": "AN-001",
                "type": "Quality Control",
                "severity": "High",
                "description": "Unusual scrap rate detected on Work Center 'Assembly Line B'. 15% increase in failed Road Tests over the last 48 hours.",
                "affected_modules": ["Manufacturing"]
            },
            {
                "id": "AN-002",
                "type": "Supply Chain",
                "severity": "Medium",
                "description": "Vendor 'Global Parts Co.' delivery times have increased by an average of 4 days compared to historical baselines.",
                "affected_modules": ["Purchase"]
            }
        ]
    }
