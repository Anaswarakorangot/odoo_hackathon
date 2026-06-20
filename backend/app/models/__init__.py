# Import all models so they are registered with Base.metadata
from app.models.user import User, RoleEnum
from app.models.vendor_customer import Vendor, Customer
from app.models.product import Product, ProductTypeEnum, ProcurementTypeEnum
from app.models.bom import BOM, BomLine, BomOperation
from app.models.sales import SalesOrder, SalesOrderLine, SOStatusEnum
from app.models.purchase import PurchaseOrder, PurchaseOrderLine, POStatusEnum
from app.models.manufacturing import ManufacturingOrder, MoComponent, WorkOrder, MOStatusEnum
from app.models.stock_ledger import StockLedger, LedgerMovementEnum
from app.models.audit_log import AuditLog, AuditActionEnum
from app.models.permissions import RolePermission

__all__ = [
    # User
    "User",
    "RoleEnum",
    # Vendor/Customer
    "Vendor",
    "Customer",
    # Product
    "Product",
    "ProductTypeEnum",
    "ProcurementTypeEnum",
    # BOM
    "BOM",
    "BomLine",
    "BomOperation",
    # Sales
    "SalesOrder",
    "SalesOrderLine",
    "SOStatusEnum",
    # Purchase
    "PurchaseOrder",
    "PurchaseOrderLine",
    "POStatusEnum",
    # Manufacturing
    "ManufacturingOrder",
    "MoComponent",
    "WorkOrder",
    "MOStatusEnum",
    # Stock Ledger
    "StockLedger",
    "LedgerMovementEnum",
    # Audit Log
    "AuditLog",
    "AuditActionEnum",
    # Permissions
    "RolePermission",
]
