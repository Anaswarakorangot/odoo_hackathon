<div align="center">

<br/>

```
███╗   ██╗███████╗ ██████╗ ████████╗ ██████╗ ██████╗  ██████╗ ██╗   ██╗███████╗
████╗  ██║██╔════╝██╔═══██╗╚══██╔══╝██╔═══██╗██╔══██╗██╔═══██╗██║   ██║██╔════╝
██╔██╗ ██║█████╗  ██║   ██║   ██║   ██║   ██║██████╔╝██║   ██║██║   ██║█████╗  
██║╚██╗██║██╔══╝  ██║   ██║   ██║   ██║   ██║██╔══██╗██║▄▄ ██║██║   ██║██╔══╝  
██║ ╚████║███████╗╚██████╔╝   ██║   ╚██████╔╝██║  ██║╚██████╔╝╚██████╔╝███████╗
╚═╝  ╚═══╝╚══════╝ ╚═════╝    ╚═╝    ╚═════╝ ╚═╝  ╚═╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝
```

### **Mini ERP for Custom Car Manufacturers**
*Built for the 24-Hour Odoo Hackathon*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5+-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00?style=flat-square)](https://sqlalchemy.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)

</div>

---

## What is NEOTORQUE?

**NEOTORQUE** is a purpose-built, role-aware Mini ERP system designed for **custom automobile assembly manufacturers** — companies that build vehicles from raw components up, think Tata/Mahindra scale. It handles the entire operational lifecycle: sourcing raw components from vendors, assembling sub-units like engine assemblies and chassis frames, building finished vehicles, selling to fleet customers, and tracking every component batch for safety recall management.

The system was built end-to-end in **24 hours** as part of an Odoo Hackathon, covering Sales, Purchase, Manufacturing, Inventory, BOM management, automated procurement triggers, and a full audit trail — without a single Alembic migration in sight.

---

## Feature Highlights

### Core ERP Modules

| Module | What it does |
|--------|-------------|
| **Sales Orders** | Create and track orders for finished vehicles (Sedan, SUV, Hatchback). Full state machine: Draft → Confirmed → Partially Delivered → Fully Delivered → Cancelled |
| **Purchase Orders** | Source raw components from vendors (Bharat Forge, MRF, Bosch India, etc.). Batch number tracking on receipt for recall traceability |
| **Manufacturing Orders** | 18-step car assembly workflow with Work Orders, Component Requirements, and real-time availability checks per component |
| **Bill of Materials** | Hierarchical BOM definitions with per-unit component quantities and assembly operations. Scales linearly with MO quantity |
| **Products** | Unified catalog for finished goods, sub-assemblies, and raw components. Role-specific form views per department |
| **Inventory** | Live on-hand and free-to-use quantity tracking via a locked stock ledger service |

### Smart Automation

- **Procurement Trigger** — When a Sales Order is confirmed and stock is short, NEOTORQUE automatically creates a Draft Purchase Order (for bought components) or a Draft Manufacturing Order (for manufactured sub-assemblies). No manual follow-up needed.
- **Recursive MO Cascade** — If a sub-assembly's own components are short and procure-on-demand, NEOTORQUE creates child Manufacturing Orders linked to the parent, so nothing slips through.
- **Row-locked Stock Service** — All stock movements go through a single `adjust_stock()` service with `SELECT ... FOR UPDATE`, preventing oversell race conditions when two orders confirm simultaneously.
- **Terminal-only Stock Moves** — `on_hand_qty` only changes at fully terminal states (Fully Delivered, Fully Received, Done). Partial states never mutate stock — this is by design.

### Recall Management
Flag a defective component batch and instantly see every Manufacturing Order that consumed it, which finished vehicles they produced, and which customers received those vehicles. Nobody else at the hackathon had this.

### Role-Based Access

Five operational roles, each with a tailored UI:

| Role | What they see | Sidebar |
|------|--------------|---------|
| **Sales Executive** | Customer orders, fleet management, finished vehicle catalog | Dashboard → Sales Orders → Products |
| **Procurement Officer** | Vendor POs, raw component catalog | Dashboard → Purchase Orders → Products |
| **Production Engineer** | MOs, BOMs, sub-assembly catalog | Dashboard → Manufacturing → BOM → Products |
| **Inventory Controller** | Full product catalog, stock levels | Dashboard → Inventory → Products |
| **Business Owner** | Full operational visibility, all modules | All 7 modules |
| **System Admin** | User management, role permissions, audit logs | Admin panel only |

### Audit Trail
Every status transition and field change is logged server-side with module, record, action, field name, old value, and new value. Filterable by date range, user, module, and action type.

---

## Architecture

```
neotorque/
├── backend/                         # FastAPI application
│   ├── app/
│   │   ├── api/
│   │   │   ├── dependencies.py      # require_permission() JWT + RBAC
│   │   │   └── routes/
│   │   │       ├── auth.py          # Signup, login (login_id based)
│   │   │       ├── sales_orders.py  # Full SO state machine
│   │   │       ├── purchase_orders.py
│   │   │       ├── manufacturing_orders.py
│   │   │       ├── boms.py
│   │   │       ├── products.py
│   │   │       ├── users.py
│   │   │       └── dashboard.py
│   │   ├── models/                  # SQLAlchemy 2.0 ORM models
│   │   │   ├── user.py
│   │   │   ├── vendor_customer.py
│   │   │   ├── product.py
│   │   │   ├── bom.py
│   │   │   ├── sales.py
│   │   │   ├── purchase.py
│   │   │   ├── manufacturing.py
│   │   │   ├── stock_ledger.py
│   │   │   ├── audit_log.py
│   │   │   └── permissions.py
│   │   ├── services/
│   │   │   ├── stock_service.py     # The ONLY place on_hand_qty is touched
│   │   │   ├── audit_service.py     # log_change() — called on save + transitions
│   │   │   └── procurement_service.py # Auto-PO / auto-MO trigger
│   │   ├── schemas/                 # Pydantic request/response models
│   │   └── db/
│   │       ├── database.py
│   │       └── seed_permissions.py  # Idempotent role permission seed
│   ├── schema_reference.sql         # Locked schema — source of truth
│   └── main.py                      # Base.metadata.create_all() on startup
│
└── frontend/                        # React + Vite + TypeScript
    └── src/
        ├── api/                     # Typed API client functions
        ├── components/
        │   ├── layout/
        │   │   ├── Sidebar.tsx      # Role-filtered nav
        │   │   ├── AppShell.tsx
        │   │   └── AuthPageShell.tsx
        │   └── brand/
        ├── contexts/
        │   └── AuthContext.tsx      # JWT + user state (React Context)
        ├── pages/
        │   ├── auth/                # Login, Signup (role card flow)
        │   ├── sales/               # SO list, kanban, form, deliver modal
        │   ├── purchase/            # PO list, kanban, form
        │   ├── manufacturing/       # MO list, form, work orders, components
        │   ├── products/            # Product list + role-aware form
        │   ├── recall/              # Recall lookup
        │   └── admin/               # User management, permissions
        └── types/                   # TypeScript interfaces
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite 5, TypeScript, Vanilla CSS |
| **Backend** | FastAPI, Python 3.11+, SQLAlchemy 2.0 |
| **Database** | PostgreSQL (Render cloud) |
| **Auth** | JWT (python-jose), bcrypt password hashing |
| **State** | React Context API (no Redux) |
| **HTTP Client** | Axios with interceptors for JWT injection |
| **ORM** | SQLAlchemy 2.0 — `Base.metadata.create_all()` (no Alembic) |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (or a Render PostgreSQL URL)

---

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate        # Windows
source venv/bin/activate       # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and SECRET_KEY

# Start the dev server (tables are auto-created on startup)
uvicorn main:app --reload
```

The API will be live at `http://localhost:8000`.  
Swagger docs: `http://localhost:8000/docs`

> **Note:** No Alembic, no migrations. `Base.metadata.create_all()` runs on every startup and is idempotent — it only creates missing tables, never drops existing ones.

---

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app will be live at `http://localhost:5173`.

---

### Default Admin Account

On first startup, create an admin user via the signup API with `is_system_admin: true`, or seed one directly in the database. The admin panel is accessible at `/admin` after login.

---

## Domain Data — NEOTORQUE Motors

The system ships with a realistic DriveForge-inspired product catalog:

**Finished Vehicles (what's sold)**
| Vehicle | Price |
|---------|-------|
| Sedan — CityDrive X1 | ₹8,50,000 |
| SUV — TerraCruise 4X4 | ₹15,00,000 |
| Electric Hatchback — VoltZip | ₹12,00,000 |

**10 Internal Sub-Assemblies** — Engine Assembly, Transmission, Chassis Frame, Suspension, Brake System, Electrical Wiring Harness, Interior Dashboard Unit, Fuel System, Exhaust Assembly, Wheel & Tyre Assembly

**170+ Raw Components** tracked across vendors:

| Vendor | Supplies |
|--------|---------|
| Bharat Forge Ltd | Engine Block, Chassis Rails, Crankshaft |
| MRF Tyres | Tyres, Tubes |
| Bosch India | ABS Sensors, Fuel Injectors, Spark Plugs |
| Minda Industries | Wiring Harness, Fuse Box, Relays |
| Sundaram Fasteners | All Bolts, Nuts, Screws |
| AGC Glass India | Windshield, Side Windows |
| Sona BLW | Transmission, Driveshaft |

**18-Step Assembly Workflow** per vehicle:
Parts Inspection → Chassis Fabrication → Engine Sub-Assembly → Transmission Sub-Assembly → Drivetrain Marriage → Suspension Fitment → Brake System Install → Body Panel Fitment → Paint & Finishing → Electrical & Wiring → Interior Fitment → Fuel & Exhaust Install → Glass & Sealing → Wheel Mounting → Pre-Delivery Inspection → Road Test → Final QC Sign-off → Dispatch Preparation

---

## Key Design Decisions

### Why `on_hand_qty` only moves at terminal states
Stock doesn't move during partial deliveries or partial receipts — only at Fully Delivered / Fully Received / Done. This is intentional: `on_hand_qty` and `reserved_qty` are designed to be read together. The reserved quantity is exactly what's covering the gap between what's on hand and what's been committed.

### Why procurement triggers use `on_hand_qty`, not `free_to_use_qty`
The trigger condition is `on_hand_qty < ordered_qty` — the literal spec wording. Using free-to-use would be more "correct" but isn't what's written. A code comment marks this explicitly.

### Why the availability check uses `>=` not `==`
The wireframe says `"Available" only if free_to_use_qty EXACTLY EQUALS to_consume`. An exact-match would mark a component "Not Available" when you have MORE than enough — obvious imprecision. Built as `>=` with a comment noting the deviation.

### Row-locked stock mutations
`adjust_stock()` uses `SELECT ... FOR UPDATE` so two Sales Orders confirming simultaneously for the same product serialize at the database level. Tested with two concurrent DB sessions.

### Audit logging is server-side only
`log_change()` is called in route handlers on save and status transitions, never from client-side onChange events. Per-field old/new values are captured at mutation time.

---

## 📡 API Overview

```
POST   /api/auth/signup              Register (role-based)
POST   /api/auth/login               JWT login (login_id + password)
GET    /api/users/me                 Current user profile

GET    /api/sales-orders/            List / search
POST   /api/sales-orders/            Create (Draft)
GET    /api/sales-orders/{id}        Detail
PATCH  /api/sales-orders/{id}        Edit (field-locked by status)
POST   /api/sales-orders/{id}/confirm     Draft → Confirmed + procurement trigger
POST   /api/sales-orders/{id}/deliver     → Partially / Fully Delivered
POST   /api/sales-orders/{id}/cancel      → Cancelled

# Mirror pattern for /purchase-orders and /manufacturing-orders

GET    /api/products                 Product catalog
GET    /api/products/{id}/stock      Live stock: on_hand / reserved / free_to_use

GET    /api/boms                     BOM list
POST   /api/boms                     Create BOM with components + operations

GET    /api/dashboard/summary        Aggregate stats (role-gated)
GET    /api/recall/lookup            Batch → affected MOs → customers
GET    /api/audit-logs               Filterable audit log
```

Full interactive docs at `/docs` when the backend is running.

---

## Hackathon Context

Built for the **Odoo Hackathon** in 24 hours by the DevNova team. The challenge: build a functional, role-aware ERP from scratch in a single day, against a locked wireframe and schema reference. 

What made it stand out:
- **Recall Management** — no other team had this
- **Recursive procurement cascade** — sub-assembly shortages trigger child MOs automatically  
- **Role-specific UI everywhere** — signup, sidebar, product forms, and dashboards are all contextually different per role
- **Concurrency-safe stock** — row-locked mutations, terminal-only stock moves
- **VIN Number generation** — auto-generated `DFM-2026-XXXXX` identifiers linked to MOs
- **Paint color variants** — CityDrive X1 available in Pearl White, Midnight Black, Fiesta Red

---

## Team

Built with ❤️ by the DevNova team during the Odoo Hackathon.

---

<div align="center">

**NEOTORQUE ERP** — *From raw steel to the open road, every bolt tracked.*

</div>
