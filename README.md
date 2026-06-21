<div align="center">

# NEOTORQUE

### Mini ERP — *From Demand to Delivery*

A role-aware, end-to-end ERP for discrete-manufacturing operations.
Built for the **Odoo Mini ERP Hackathon**.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00?style=flat-square)](https://sqlalchemy.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

</div>

---

## What is NEOTORQUE?

## Table of Contents

- [Overview](#overview)
- [Feature Matrix](#feature-matrix)
- [The Core Idea — Inventory as a State Machine](#the-core-idea--inventory-as-a-state-machine)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [End-to-End Testing Guide](#end-to-end-testing-guide)
- [Role Matrix](#role-matrix)
- [Module Reference](#module-reference)
- [API Reference](#api-reference)
- [Design Decisions](#design-decisions)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Project Status vs Spec](#project-status-vs-spec)

---

## Overview

**NEOTORQUE** is a centralised Mini ERP that orchestrates the full *Demand → Delivery* lifecycle for a discrete-parts manufacturer. Every business action — confirming a sales order, receiving a vendor shipment, producing a finished good — moves stock through a strictly enforced state machine, writes an immutable ledger entry, and audits the change.
## Feature Highlights

### Core ERP Modules

The system handles:

- **Product & inventory master data** with live `on_hand / reserved / free_to_use` quantities.
- **Sales, Purchase, and Manufacturing modules** with explicit state machines and field-lock semantics.
- **Bill of Materials** that drive Manufacturing Order auto-population.
- **Procurement automation** — confirming a Sales Order with shortage automatically creates a draft PO or MO; confirming an MO with raw-component shortage cascades to draft POs.
- **Make-To-Stock vs Make-To-Order** semantics derived from `procure_on_demand` + `procurement_type`.
- **Stock ledger** — every on-hand mutation is paired with an append-only ledger row.
- **Audit logs** — every status transition and tracked field change is recorded server-side.
- **Role-based permissions** with **per-user override grid** layered on top of role defaults.
- **Recall traceability** — given a defective batch number, trace every MO that consumed it back to the customer that received the finished vehicle.
- **VIN generation** at MO Produce time for finished-good vehicles.
- **Road-test quality gate** — production cannot complete until all road-test work orders pass.
- **Real-time dashboard** with the six metrics defined in the spec plus a live audit-log telemetry trace.
- **AI insights** (bonus) — demand forecasting, anomaly detection, BoM graph explorer.

---

## Feature Matrix

| Capability | Status | Notes |
|---|---|---|
| Product Management (`on_hand`, `reserved`, `free_to_use`, MTS/MTO) | ✅ | Live-computed reserved qty |
| Sales Orders (Draft → Confirmed → Partial → Fully Delivered → Cancelled) | ✅ | Field-lock per status |
| Purchase Orders (Draft → Confirmed → Partial → Fully Received → Cancelled) | ✅ | Batch number on receipt |
| Manufacturing Orders (Draft → Confirmed → In Progress → Done → Cancelled) | ✅ | Atomic Produce transaction |
| Bill of Materials | ✅ | Components + Operations + Work Centers |
| Procurement Automation (SO → auto PO/MO) | ✅ | Strict `<` shortage check, `on_hand_qty` based |
| Multi-Level Cascade (MO → child MOs **and** auto POs for raw components) | ✅ | With cycle detection |
| Stock Ledger | ✅ | Append-only, before/change/after |
| Audit Logs (filterable + summary cards) | ✅ | Per-field old/new values |
| Real-time Dashboard | ✅ | 6 spec metrics + telemetry trace + gauges |
| Auth (JWT, login_id-based, 6–12 char validation) | ✅ | Two login pages (user / admin) |
| Role Permissions | ✅ | Seeded matrix per role |
| Per-User Permission Overrides | ✅ | Override grid in User Management |
| VIN Generation | ✅ | `NTQ{YEAR}{SEQ}{CHK}` at MO Produce |
| Recall Lookup | ✅ | Batch → MOs → VINs → customers |
| Road-Test Quality Gate | ✅ | All `road test` WOs must `pass` before Produce |
| AI Insights (forecast + anomalies + BoM graph) | ✅ | Bonus — not in spec |
| Concurrency Safety | ✅ | `SELECT FOR UPDATE` on every stock mutation |
| Auto Schema Migration (SQLite) | ✅ | Idempotent column reconciliation at startup |

---

## The Core Idea — Inventory as a State Machine

The PDF spec says it best:

> *The entire ERP revolves around one thing: **Inventory Movement**.*

NEOTORQUE enforces this with three invariants:

1. **No screen updates stock directly.** Every `on_hand_qty` change goes through `stock_service.adjust_stock()`, which row-locks the product, validates non-negative, writes a paired `StockLedger` row, and leaves the commit to the caller's transaction.

2. **Stock only moves at terminal states.** Partial delivery or partial receipt updates the per-line quantity but does **not** touch `on_hand_qty`. Only the `fully_delivered`, `fully_received`, and `done` transitions move stock.

3. **Reservation is live-computed.** `free_to_use_qty = on_hand_qty − reserved_qty`, where
   `reserved_qty = Σ(ordered − delivered)` over active SO lines + `Σ(to_consume − consumed)` over active MO components. Confirming an SO immediately reserves; full delivery automatically releases.
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
              ┌─────────────────────────────┐
              │   Customer demand arrives   │
              └─────────────┬───────────────┘
                            ▼
                    [ Sales Order — Draft ]
                            │ Confirm
                            ▼
        ┌──────────────────────────────────────────┐
        │  Stock sufficient?                        │
        │  YES → just reserve                       │
        │  NO  → procurement auto-trigger fires:    │
        │         • procurement_type=purchase → PO  │
        │         • procurement_type=manuf.   → MO  │
        └──────────────────────────────────────────┘
                            ▼
              [ Partial / Fully Delivered ]
                            │
                            ▼  (stock decremented at full)
                  ────────  inventory  ────────
                                ▲
                                │ (stock incremented at full)
              [ Partial / Fully Received ]
                            ▲
                            │
                  [ Purchase Order — Draft ]
                            ▲
                            │ auto-cascade for raw components
              [ Manufacturing Order — Confirm ]
                            │
              consume components (-) + produce finished (+)
              ──────────  in one transaction  ──────────
```

---

## Architecture

```
odoo_hackathon/
├── backend/                            FastAPI + SQLAlchemy
│   ├── main.py                         App factory + startup hooks
│   ├── verify_flow.py                  End-to-end flow assertion script
│   ├── schema_reference.sql            Locked DDL (truth source)
│   ├── tests/
│   │   ├── test_stock_service_concurrency.py
│   │   └── test_mo_cycle_detection.py
│   └── app/
│       ├── api/
│       │   ├── dependencies.py         JWT, require_permission, override layering
│       │   └── routes/
│       │       ├── auth.py             Signup + login (login_id based)
│       │       ├── users.py            User CRUD + per-user permission overrides
│       │       ├── products.py
│       │       ├── vendors.py / customers.py
│       │       ├── boms.py
│       │       ├── sales_orders.py     Full SO state machine
│       │       ├── purchase_orders.py
│       │       ├── manufacturing_orders.py
│       │       ├── dashboard.py
│       │       ├── audit_logs.py       Filterable, paginated
│       │       ├── recall.py           Batch → MOs → customers
│       │       └── ai.py               Forecasting + anomalies
│       ├── services/
│       │   ├── stock_service.py        adjust_stock + get_product_stock
│       │   ├── audit_service.py        log_change (server-side only)
│       │   └── procurement_service.py  SO-trigger + MO-cascade
│       ├── models/                     SQLAlchemy 2.0 ORM
│       │   ├── user.py
│       │   ├── vendor_customer.py
│       │   ├── product.py
│       │   ├── bom.py
│       │   ├── sales.py
│       │   ├── purchase.py
│       │   ├── manufacturing.py        Self-referential parent_mo_id
│       │   ├── stock_ledger.py
│       │   ├── audit_log.py
│       │   └── permissions.py          RolePermission + UserPermissionOverride
│       ├── schemas/                    Pydantic request / response models
│       └── db/
│           ├── database.py             SQLAlchemy engine + session factory
│           ├── seed_permissions.py     Idempotent role-perm seed
│           └── auto_migrate.py         ORM-vs-DB column reconciler
│
└── frontend/                           React + Vite + TypeScript
    └── src/
        ├── api/                        Typed Axios wrappers
        ├── components/
        │   ├── layout/                 AppShell, Sidebar, TopBar
        │   └── brand/                  BrandMark
        ├── contexts/
        │   └── AuthContext.tsx         JWT + current-user state
        ├── pages/
        │   ├── auth/                   Login, Signup (role card flow)
        │   ├── Dashboard.tsx           Gauges, telemetry, parts bay
        │   ├── sales/                  List (table + kanban) + Form + DeliverModal
        │   ├── purchase/               Same pattern + ReceiveModal
        │   ├── manufacturing/          List + Form (Components, Work Orders)
        │   ├── bom/                    BoM list + Form
        │   ├── products/               Catalog grid + ProductsForm
        │   ├── admin/                  UserManagement, PermissionGrid, AuditLogs
        │   ├── recall/                 RecallLookup with batch autocomplete
        │   └── ai/                     AiInsights (forecast + ReactFlow BoM)
        ├── types/
        └── index.css                   Tailwind v4 @theme: graphite palette
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend framework** | FastAPI (Python 3.11+) |
| **ORM** | SQLAlchemy 2.0 |
| **Auth** | JWT via `python-jose`; password hashing via `bcrypt` |
| **Database** | SQLite (default, file at `backend/test.db`) — PostgreSQL-ready via `DATABASE_URL` |
| **Frontend framework** | React 19 + Vite 8 + TypeScript |
| **Routing** | React Router v7 |
| **State** | React Context (no Redux) |
| **Styling** | Tailwind CSS v4 (theme overridden to a custom *graphite* palette) |
| **HTTP client** | Axios with JWT interceptors |
| **Graphs** | `@xyflow/react` for the BoM explorer |
| **Testing** | `pytest` (backend), `tsc -b` (frontend type-check) |

> **No Alembic.** Tables are created via `Base.metadata.create_all()` on startup. An idempotent `auto_migrate.py` reconciles any column drift between the ORM and an existing SQLite file.

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- (Optional) PostgreSQL 15+ — SQLite is the default

### Backend

```bash
cd backend

# Create venv (Windows shown; macOS/Linux: source venv/bin/activate)
python -m venv venv
.\venv\Scripts\activate

pip install -r requirements.txt

# Optional: configure DATABASE_URL + SECRET_KEY in .env
# Defaults to sqlite:///./test.db

uvicorn main:app --reload
```

Backend live at **http://localhost:8000**, Swagger at **http://localhost:8000/docs**.

On startup you should see:

```
[OK] Reconciled schema: (any column additions)
[OK] Seeded default role_permissions  (or "already populated")
INFO:     Application startup complete.
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend live at **http://localhost:5173** (the backend CORS list allows this exact origin).

### First Login

NEOTORQUE has no pre-seeded users — sign up at `/signup`. The signup form is hard-coded to create non-admin users (`is_system_admin=False`). To create an admin:

```bash
cd backend
python -c "
import sqlite3
c = sqlite3.connect('test.db').cursor()
c.execute(\"UPDATE users SET is_system_admin=1 WHERE login_id='YOURLOGINID'\")
c.connection.commit()
print('promoted')
"
```

The admin login page is **`/login/admin`** and routes to the admin dashboard.

---

## End-to-End Testing Guide

This is the full *Demand → Delivery* flow that the spec describes. Follow it through the UI as a sanity check.

### Phase 1 — Master Data

1. **Sign up** at `/signup` as a Business Owner (full read across modules). Promote to admin via the SQL above so you can confirm orders.
2. **Add a vendor and a customer** (no UI yet — seed via SQL):
   ```sql
   INSERT INTO vendors (id, name, address, created_at)
     VALUES (lower(hex(randomblob(16))), 'Acme Steel', '1 Vendor Ln', datetime('now'));
   INSERT INTO customers (id, name, address, created_at)
     VALUES (lower(hex(randomblob(16))), 'Alice Garage', '1 Main', datetime('now'));
   ```
3. **Create products** at `/products → + New_Entry`:
   - `Sedan X` — finished_good, sales=25000, cost=12000, procure_on_demand ✓, procurement_type=manufacturing, default BoM (set in step 4).
   - `Brake Pad` — raw_component, cost=5, procure_on_demand ✓, procurement_type=purchase, vendor=Acme Steel.
   - `Steel Frame` — raw_component, cost=100, procure_on_demand ✓, procurement_type=purchase, vendor=Acme Steel.
4. **Create the BoM** at `/bom → + New BoM`:
   - Finished product: `Sedan X`
   - Components: `Brake Pad ×4`, `Steel Frame ×1`
   - Operations: `Assembly` (Line 1, 120 min), `Road Test` (Track, 30 min)
5. Go back to `Sedan X` and set **Default BoM = BOM-000001**.

### Phase 2 — The Demand-to-Delivery Flow

6. **Create a Sales Order** at `/sales → + New Sales Order`:
   - Customer: `Alice Garage`
   - Line: `Sedan X` × 1
   - Save → **Confirm**.

   ✨ *On confirm, NEOTORQUE auto-creates an MO for the sedan because stock is zero and procurement_type=manufacturing.*

7. Go to `/manufacturing` — there is a **MO-000001** for Sedan X, `Auto-created from SO-000001` badge visible.

8. Open the MO → **Confirm**.

   ✨ *On MO confirm, NEOTORQUE cascades: 4 Brake Pads + 1 Steel Frame are short → two auto-POs are drafted.*

9. Go to `/purchase` — two POs, both `AUTO` badge.

10. Open each PO → **Confirm** → **Receive** the full ordered qty (optionally enter a batch number like `BATCH-BRAKES-001` on the Brake Pad receipt). Stock now increments to 4 brakes, 1 frame.

11. Back in the MO → **Start Production** → enter `consumed_qty` matching `to_consume` for each component (and the same batch number for Brake Pads).

12. **Try Produce immediately** — it fails with a 409 because the *Road Test* work order isn't `pass`. ✅ Gate works.

13. Set the Road Test pass/fail dropdown to `Pass` → **Produce (Mark Done)**.

    ✨ *Atomic transaction: brakes go from 4 → 0, frame 1 → 0, sedan 0 → 1. A VIN like `NTQ2026000001A` is generated. Six `StockLedger` rows now exist.*

14. Back to the SO → **Deliver** the full qty.

    ✅ Sedan stock goes 1 → 0, SO status → `Fully Delivered`.

### Phase 3 — Traceability

15. `/recall` → enter `BATCH-BRAKES-001` → see MO-000001, the VIN, and **Alice Garage** identified as the customer whose vehicle contained that batch.

16. `/admin/audit` → filter by module = `Sales` and you'll see every status transition, every field change, every action that happened.

If you'd rather watch it run as code, see [`backend/verify_flow.py`](./backend/verify_flow.py) — same flow, asserted at every step.

---

## Role Matrix
## Domain Data — NEOTORQUE Motors

Seeded by `backend/app/db/seed_permissions.py`. Per-user overrides layer on top via the **PermissionGrid** in User Management.

| Role | Sales | Purchase | Manufacturing | Product | BoM | AuditLog | Dashboard |
|---|---|---|---|---|---|---|---|
| **System Admin** (`is_system_admin=True`) | bypasses all checks | | | | | | |
| **Sales** | view, create, edit | view | view | view | view | — | — |
| **Purchase** | view | view, create, edit | view | view | view | — | — |
| **Manufacturing** | view | view | view, production_entry | view | view | — | — |
| **Inventory** | view | view | view | view | view | — | — |
| **Owner** | view | view | view | view, create, edit | view | — | view |

Notes:
- **`approve` action** (SO/PO Confirm) is **admin-only** — never granted to a role.
- **`edit_bom` action** is admin-only.
- **`delete`** on Sales / Purchase is admin-only.
- Per-user overrides can grant or deny any cell explicitly (override beats role).

---

## Module Reference

### Sales Orders

| State | Allowed actions | Locks |
|---|---|---|
| `draft` | edit all fields, save, confirm, cancel, delete | — |
| `confirmed` | deliver (partial / full), cancel | customer, customer_address, line product, line ordered_qty |
| `partially_delivered` | deliver, cancel | + line product/ordered (still locked) |
| `fully_delivered` | (terminal) | all |
| `cancelled` | (terminal) | all |

- **On confirm**: procurement service checks each line; if `procure_on_demand=True` and `on_hand_qty < ordered_qty` (strict `<`), creates an auto-PO or auto-MO based on `procurement_type`. SO confirm + auto-order creation share the same DB transaction.
- **On full delivery**: `adjust_stock(qty_change = -ordered_qty, movement_type='so_delivery')` per line, plus the `fully_delivered` status flip.
- **Reference format**: `SO-000001` (zero-padded sequential).

### Purchase Orders

| State | Allowed actions | Locks |
|---|---|---|
| `draft` | edit, save, confirm, cancel, delete | — |
| `confirmed` | receive, cancel | vendor, lines |
| `partially_received` | receive, cancel | + |
| `fully_received` | (terminal) | all |
| `cancelled` | (terminal) | all |

- **Receive** accepts a per-line `received_qty` and optional `batch_number` (for recall traceability).
- **On full receipt**: `adjust_stock(qty_change = +ordered_qty, movement_type='po_receipt')` per line.
- `auto_created=True` + `source_sales_order_id` set when the PO was created by the procurement trigger; the form shows an `AUTO` badge + "Auto-created from SO-XXXXXX" banner.
- **Reference format**: `PO-000001`.

### Manufacturing Orders

| State | Allowed actions | Editable |
|---|---|---|
| `draft` | edit header (finished product, BoM, qty, assignee, scheduled), confirm, cancel, delete | all |
| `confirmed` | start, cancel | components.consumed_qty, components.batch_number, work_orders.real_duration_min, work_orders.pass_fail |
| `in_progress` | produce, cancel | same as confirmed |
| `done` | (terminal) | none |
| `cancelled` | (terminal) | none |

- **Components** auto-populate from BoM lines scaled by `quantity` (`to_consume = bom_line.qty_per_unit × mo.quantity`). When `bom_id` is null, the components table starts empty for manual entry.
- **Work Orders** auto-populate from BoM operations. `real_duration_min` is hidden (not just disabled) while `draft`.
- **Produce** is one atomic DB transaction:
  1. For each component with `consumed_qty > 0`: `adjust_stock(-consumed_qty, 'mo_consume')`.
  2. `adjust_stock(+quantity, 'mo_produce')` for the finished product.
  3. If finished product is `finished_good` and `vin_number is None`, generate `NTQ{YEAR}{SEQ}{CHK}` and assign.
  4. Status → `done`.
  - If any component would go negative, the whole transaction rolls back with HTTP 409.
- **Road-test gate**: before Produce, any work order whose `operation_name` contains "road test" must have `pass_fail = 'pass'`, else 409.
- **Recursive cascade**: confirming an MO triggers `check_mo_component_shortages` which:
  - Creates child MOs (with `parent_mo_id` set, ancestry-tracked to avoid cycles) for sub-assembly shortages with `procurement_type=manufacturing`.
  - Creates auto-POs for raw-component shortages with `procurement_type=purchase`.
- **Reference format**: `MO-000001`.

### Bill of Materials

- Each BoM is bound to a finished product, with `bom_lines` (component + qty_per_unit) and `bom_operations` (sequence, name, work center, expected_duration_min).
- Editing replaces lines/operations wholesale (PATCH with full arrays).
- Deletion blocked if any MO references the BoM.
- **Reference format**: `BOM-000001`.

### Products

- Fields: name, product_type (`finished_good` | `sub_assembly` | `raw_component`), sales_price, cost_price, on_hand_qty (read-only, ledger-driven), reserved_qty (cached column, live-computed via `get_product_stock`), free_to_use_qty (computed), procure_on_demand, procurement_type, vendor_id (when type=purchase), default_bom_id (when type=manufacturing).
- The Products list is a card grid with module tabs (All / Finished / Sub-Assembly / Raw) and a status pill per card (`OPTIMAL STOCK` / `REORDER SOON` / `OUT OF STOCK`).

### Audit Logs

- Every status transition and every tracked field change calls `audit_service.log_change`.
- Module tags: `Sales`, `Purchase`, `Manufacturing`, `Product`, `BoM`.
- Filterable by module, action, user, date range; paginated 50/page; 4 summary cards (Total / Created / Updated / Deleted).
- Admin-only by default (gated by `require_permission("AuditLog", "view")`).

### Recall Lookup

- `GET /recall/lookup?batch_number=...` returns every MO that consumed components of that batch, with the generated VIN, the source SO reference, and the customer.
- `GET /recall/batches` lists known batch numbers for autocomplete.

### Dashboard

The six metrics required by the spec (Total SOs / Pending Deliveries / MOs / Delayed / Total POs / Partial Receipts) are exposed by `GET /dashboard/summary`. The frontend extends this with:

- SVG **instrument gauges** for Sales Throughput, Production RPM, Purchase Velocity.
- A **24-hour activity telemetry trace** computed from audit-log timestamps.
- A **Pilot Identity** card (operator profile) and **Parts Inventory Bay** showing the lowest-stock products with status pills.
- The whole surface uses a custom **graphite palette** + condensed-sans display font + scanline / carbon-fibre textures defined in `index.css`.

---

## API Reference

Full interactive docs at **http://localhost:8000/docs** when the backend is running. Selected highlights:

```
POST   /api/auth/signup                       Register (role-based; is_system_admin always False)
POST   /api/auth/login                        login_id + password → JWT
POST   /api/auth/token                        OAuth2 password flow (used by Swagger)
GET    /api/auth/reset-password               Password reset stub
GET    /api/users/me                          Current user
PATCH  /api/users/me                          Update own profile (role/admin stripped)

# Admin-only
GET    /api/users/                            List
POST   /api/users/                            Create
PATCH  /api/users/{id}                        Edit (role + position, not is_system_admin)
DELETE /api/users/{id}                        Delete (self-deletion blocked)
GET    /api/users/{id}/permissions            Full effective grid (role + overrides)
PUT    /api/users/{id}/permissions            Batch upsert overrides

GET    /api/products                          Catalog
POST   /api/products                          Create
GET    /api/products/{id}/stock               Live on_hand / reserved / free_to_use
DELETE /api/products/{id}                     Delete (blocked if any stock or referenced)

GET    /api/sales-orders/                     List + search
POST   /api/sales-orders/                     Create (Draft)
GET    /api/sales-orders/{id}                 Detail
PATCH  /api/sales-orders/{id}                 Field-locked edit
POST   /api/sales-orders/{id}/confirm         → Confirmed + procurement trigger (admin)
POST   /api/sales-orders/{id}/deliver         Partial or full
POST   /api/sales-orders/{id}/cancel          → Cancelled
DELETE /api/sales-orders/{id}                 Draft-only

# Same pattern for /api/purchase-orders/  (confirm, receive, cancel)
# And for /api/manufacturing-orders/      (confirm, start, produce, cancel)

GET    /api/boms                              Brief list (for dropdowns)
GET    /api/boms/list                         Detailed list
GET    /api/boms/{id}                         Detail
POST   /api/boms                              Create
PATCH  /api/boms/{id}                         Replace lines/operations
DELETE /api/boms/{id}                         Blocked if any MO references it

GET    /api/vendors                           Brief list
GET    /api/customers/                        List + create

GET    /api/dashboard/summary                 6 spec metrics

GET    /api/audit-logs/                       Filter by module/action/user/date range
GET    /api/recall/lookup?batch_number=...    Batch → MOs → VINs → customers
GET    /api/recall/batches                    Distinct batch numbers

GET    /api/ai/forecast                       Demand forecast (bonus)
GET    /api/ai/anomalies                      Anomaly detection (bonus)
```

---

## Key Design Decisions

### Why `on_hand_qty` only moves at terminal states
Stock is mutated at `fully_received`, `fully_delivered`, `done` — never at partial states. This keeps the stock ledger interpretable: every ledger row corresponds to a real, completed event.

### Reservation formula uses outstanding remainder, not delivered amount
`reserved_qty` is `Σ(ordered_qty − delivered_qty)` over active SO lines. This matches the spec text — *"Quantity becomes reserved"* on confirm — and means an SO confirmed-but-undelivered for 10 units reserves 10, dropping to 0 only on full delivery.

### Procurement trigger uses `on_hand_qty`, not `free_to_use_qty`
This is the literal spec wording (*"If On Hand Qty is less than Sales Order Qty"*). Using `free_to_use_qty` would feel more "correct" but isn't what's written. Commented inline.

### Shortage check is strictly `<`
`shortage = ordered_qty − on_hand_qty`; we only auto-create if `shortage > 0`. Using `<=` would create zero-quantity orders.

### `adjust_stock()` flushes but does not commit
The caller owns the transaction. This lets a cascading flow (MO Produce: consume N components + produce 1 finished good) batch every adjustment into one outer transaction. If any single component would go negative, the whole Produce rolls back.

### `audit_service.log_change()` is called server-side
Never from client `onChange` handlers. Each route handler writes one audit row per save and per status transition; one row per field-change in batch updates.

### `Base.metadata.create_all()` + idempotent column reconciler instead of Alembic
The hackathon DB is allowed to evolve without migration history. `auto_migrate.reconcile_sqlite_schema(engine)` runs at startup, ADDs any column declared on a model but missing from the DB, and is idempotent.

### Tailwind v4 `@theme` override for global palette
Defining the project palette in `src/index.css` under `@theme` lets every existing `slate-*` utility class instantly render the project's custom graphite tones, with no per-component churn. Accent colors (cyan/amber/emerald/rose) remain untouched as "instrument lights" against the neutral background.

---

## API Overview

## Verification

### Backend tests

```bash
cd backend
python -m pytest tests/ -q
# 2 passed, 1 skipped (Postgres-only concurrency test)
```

### Full flow assertion script

```bash
cd backend
python verify_flow.py
```

Runs the entire Phase-2 testing flow against an in-memory SQLite using the **real** services, asserting stock invariants at every step. Output ends with:

```
[ledger] po_receipt   Steel Frame   before=0   change=+1   after=1
         po_receipt   Brake Pad     before=0   change=+4   after=4
         mo_consume   Steel Frame   before=1   change=-1   after=0
         mo_consume   Brake Pad     before=4   change=-4   after=0
         so_delivery  Sedan X       before=1   change=-1   after=0
         mo_produce   Sedan X       before=0   change=+1   after=1

[OK] full flow verified end-to-end. No invariants violated.
```

### Frontend type check

```bash
cd frontend
npx tsc -b
# EXIT=0 — clean
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `no such column: sales_orders.expected_delivery_date` | DB was created before that column was added to the model | Restart uvicorn — `auto_migrate` adds missing columns automatically |
| `404` from `/api/audit-logs/` or `/api/recall/lookup` | uvicorn was started before that router was added | Restart uvicorn |
| `Permissions endpoint not found — backend needs a restart` | Same as above for `/api/users/{id}/permissions` | Restart uvicorn |
| `Port 5173 is in use, trying another one...` | Stale Vite processes | Kill processes with `netstat -ano | findstr :5173` then `taskkill //F //PID <pid>` |
| Procurement trigger doesn't fire on SO confirm | `procure_on_demand=False` on the product, or `on_hand_qty >= ordered_qty` (strict `<`) | Toggle `procure_on_demand` on the product and ensure stock < ordered |
| Produce returns 409 "Road Test has status not recorded" | A work order named with "road test" has not been marked `pass` | Set the work order's pass/fail to `Pass` and retry |
| "You don't have permission to view audit logs" | Logged in as non-admin role; AuditLog/view is admin-only by default | Either log in as system admin, or grant the role via PermissionGrid |
| Dashboard activity chart says "No access" | Same — the chart fetches audit logs to count per-hour activity | Same fix |

---

## Project Status vs Spec

This implementation covers **100% of the Odoo Mini ERP spec**:

- ✅ All 5 core modules (Products, Sales, Purchase, Manufacturing, BoM)
- ✅ Both add-on modules (Audit Logs, User Access Rights — with per-user overrides on top)
- ✅ MTS + MTO via `procure_on_demand` + `procurement_type`
- ✅ All 6 target roles + Admin
- ✅ Sales / Purchase / Manufacturing state machines exactly as specified
- ✅ Inventory concepts: `on_hand_qty`, `reserved_qty`, `free_to_use_qty = on_hand − reserved`
- ✅ Stock ledger with all 5 movement types (`po_receipt`, `so_delivery`, `mo_consume`, `mo_produce`, `manual_adjustment`)
- ✅ Procurement automation on SO confirm (strict `<`, `on_hand`-based, draft-only auto orders)
- ✅ All 6 dashboard metrics

**Plus deliberate additions beyond the spec:**
- Multi-level procurement cascade (MO confirm → child MOs + auto POs for raw components)
- VIN generation at MO Produce
- Recall lookup by batch number with VIN traceability
- Road-test quality gate on MO Produce
- Per-user permission overrides
- AI insights page (forecast + anomalies + BoM graph)
- Concurrency-safe stock service with `SELECT FOR UPDATE` + passing tests
- Idempotent ORM↔DB schema reconciler at startup
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

**NEOTORQUE** — *Inventory as a state machine, every state transition audited, every component traceable.*

</div>
