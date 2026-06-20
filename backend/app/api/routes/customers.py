"""
Customer routes.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import (
    db_dependency,
    current_user_dependency,
    require_permission,
)
from app.models.vendor_customer import Customer
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse

router = APIRouter(prefix="/customers", tags=["customers"])


@router.post(
    "/",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("Sales", "create"))],
)
def create_customer(
    request: CustomerCreate,
    db: db_dependency,
    current_user: current_user_dependency,
):
    """Create a new customer."""
    customer = Customer(
        name=request.name,
        address=request.address,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get(
    "/",
    response_model=List[CustomerResponse],
    dependencies=[Depends(require_permission("Sales", "view"))],
)
def list_customers(
    db: db_dependency,
    search: Optional[str] = None,
):
    """List all customers, optionally filtered by name."""
    query = db.query(Customer)
    if search:
        query = query.filter(Customer.name.ilike(f"%{search}%"))
    return query.order_by(Customer.name).all()


@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    dependencies=[Depends(require_permission("Sales", "view"))],
)
def get_customer(customer_id: UUID, db: db_dependency):
    """Get a specific customer by ID."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch(
    "/{customer_id}",
    response_model=CustomerResponse,
    dependencies=[Depends(require_permission("Sales", "edit"))],
)
def update_customer(
    customer_id: UUID,
    request: CustomerUpdate,
    db: db_dependency,
):
    """Update a customer."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)

    db.commit()
    db.refresh(customer)
    return customer


@router.delete(
    "/{customer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("Sales", "delete"))],
)
def delete_customer(customer_id: UUID, db: db_dependency):
    """Delete a customer."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    db.delete(customer)
    db.commit()
    return None
