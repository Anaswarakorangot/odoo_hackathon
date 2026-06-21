# DriveForge Mini ERP — Sequenced Build Prompts

Stack: React + Vite + Tailwind | FastAPI + SQLAlchemy | PostgreSQL on Render | JWT auth
Repo: `odoo_hackathon/backend` + `odoo_hackathon/frontend` (already scaffolded with basic auth/users files and a bare Vite shell)

**How to use this:** paste these into Claude Code one at a time, in order. Each one assumes the
previous ones are done. Skip Alembic entirely — use `Base.metadata.create_all()` on startup, you
don't need migration history for a 24h build. Put `schema.sql` (the locked reference schema) at
`backend/schema_reference.sql` before starting Prompt 0 so Claude Code can read it directly.

Every prompt below that quotes the wireframe is quoting it exactly (typos included) — that's
intentional, build to the literal text, not the "obviously correct" version, because judges test
against their own mockup.

---

## PROMPT 0 — SQLAlchemy models from the locked schema

```
Read backend/schema_reference.sql fully before writing any code. Translate it into SQLAlchemy
2.0-style models in backend/app/models/, one file per logical group:
  - models/user.py (extend the existing User model — don't replace it, merge in: login_id
    VARCHAR(12) unique not null with a CHECK-equivalent validator for 6-12 chars, role as a
    Python Enum mapped via SQLAlchemy Enum with values sales/purchase/manufacturing/inventory/owner
    (NOT admin — that value doesn't exist), is_system_admin Boolean not null default False,
    address, mobile_number, position, photo_url)
  - models/vendor_customer.py (Vendor, Customer)
  - models/product.py (Product with product_type enum finished_good/sub_assembly/raw_component,
    on_hand_qty, reserved_qty as a plain cached column, procure_on_demand, procurement_type enum,
    vendor_id FK, default_bom_id FK — handle the circular FK to boms with use_alter=True on
    whichever side you declare second)
  - models/bom.py (BOM, BomLine, BomOperation)
  - models/sales.py (SalesOrder, SalesOrderLine)
  - models/purchase.py (PurchaseOrder, PurchaseOrderLine)
  - models/manufacturing.py (ManufacturingOrder with self-referential parent_mo_id, MoComponent,
    WorkOrder)
  - models/stock_ledger.py (StockLedger with movement_type enum po_receipt/so_delivery/
    mo_produce/mo_consume/manual_adjustment, qty_before/qty_change/qty_after)
  - models/audit_log.py (AuditLog)
  - models/permissions.py (RolePermission: role + module + action -> allowed boolean, unique
    constraint on the triple)

Use UUID primary keys (uuid.uuid4, stored as a UUID column via postgresql.UUID(as_uuid=True)).
All foreign keys, enums, and constraints must match schema_reference.sql exactly — this is not a
"reasonable approximation" task, it's a literal translation. Wire up relationships() for every FK
so I can do model.related_object navigation in Python without manual joins.

Do NOT implement v_product_stock, v_sales_order_line_totals, v_purchase_order_line_totals,
or v_recall_lookup as database views in this step — those become Python service functions in a
later prompt, since FastAPI/SQLAlchemy makes ad-hoc business logic easier to test and adjust than
a DB view if I need to tweak a formula mid-hackathon.

After the models exist, wire Base.metadata.create_all(engine) into the FastAPI startup event in
main.py (skip Alembic). Confirm it runs cleanly against the Postgres connection in .env.
```

---

## PROMPT 1 — Auth: login_id-based login, two dashboards, signup validation

```
Extend the existing backend/app/api/routes/auth.py and backend/app/core/security.py. Do not
rebuild from scratch — adapt what's there.

Signup must enforce these exact rules (these are the literal wireframe validation rules, not
my paraphrase):
  1. login_id must be unique and between 6-12 characters.
  2. email must not be a duplicate in the database.
  3. password must contain a lowercase letter, an uppercase letter, and a special character,
     and must be more than 8 characters long.
Return field-specific 422 errors (not a generic "validation failed") so the frontend can show
the right inline message under the right field.

Login is by login_id + password, NOT email + password — the wireframe's login form is explicitly
"Login Id" / "Password", separate fields from signup's "Enter Login Id / Enter Password /
Re-Enter Password / Enter Email Id". On bad credentials return exactly the message
"Invalid Login Id or Password" (the wireframe specifies this exact string for both wrong-id and
wrong-password cases — don't leak which one was wrong).

There are TWO login flows per the wireframe, both posting to the same endpoint, but the JWT
payload must carry is_system_admin so the frontend can route to the right dashboard:
  - is_system_admin = true -> route to "System Administrator Dashboard" (manages Users + sets
    role_permissions, bypasses all role_permissions checks entirely)
  - is_system_admin = false -> route to the regular ERP dashboard, restricted by their `role`
    via role_permissions lookups

Add a require_permission(module: str, action: str) FastAPI dependency in
backend/app/api/dependencies.py that:
  - allows everything through if current_user.is_system_admin is True
  - otherwise queries role_permissions for (current_user.role, module, action) and raises 403
    if not allowed or no row exists
EXCEPTION per spec: product price reads must always succeed for any user who has ANY level of
Sales module access (view/create/edit) — don't gate Product price reads behind a separate
Product-module check when the read is happening from inside a Sales Order form. Implement this
as a separate allow_product_price_read(current_user) helper, not by loosening the general
Product permission.

Seed role_permissions with a reasonable default set on startup if the table is empty (sales role:
view/create/edit on Sales, view-only on Purchase/Manufacturing/Product; purchase role mirrors
for Purchase; manufacturing role gets view+create on Manufacturing, no edit, per spec's
"Production Entry" wording; inventory role gets view across the board; owner role gets view
across everything plus the dashboard). Make this a one-time idempotent seed, not something that
runs destructively on every restart.
```

---

## PROMPT 2 — Stock service layer (the load-bearing piece)

```
Create backend/app/services/stock_service.py. This is the single place anything is allowed to
touch on_hand_qty — no route handler should ever do product.on_hand_qty = ... directly.

Implement:

1. adjust_stock(db, product_id: UUID, qty_change: Decimal, movement_type: str,
   reference_type: str, reference_id: UUID, user_id: UUID) -> StockLedger
   - SELECT the product FOR UPDATE inside the current transaction (row lock)
   - qty_before = current on_hand_qty, qty_after = qty_before + qty_change
   - update product.on_hand_qty = qty_after
   - insert one StockLedger row with all five of those values
   - commit happens at the CALLER's transaction boundary, not inside this function — this
     function must be callable multiple times inside one larger transaction (e.g. a cascading
     MO that touches several products) without prematurely committing
   - raise an error if qty_after would go negative

2. get_product_stock(db, product_id: UUID) -> dict with on_hand_qty, reserved_qty,
   free_to_use_qty, computed live (not read from the cached reserved_qty column):
   reserved_qty = SUM(delivered_qty) across this product's sales_order_lines where the parent
   SalesOrder.status IN ('confirmed', 'partially_delivered')
   + SUM(consumed_qty) across this product's mo_components where the parent
   ManufacturingOrder.status IN ('confirmed', 'in_progress', 'to_close')
   free_to_use_qty = on_hand_qty - reserved_qty

   IMPORTANT — do not "fix" this formula to use (ordered_qty - delivered_qty). The literal
   wireframe text is "the reserved quantity is Delievered quantity" while SO isn't fully
   delivered, not the undelivered remainder. This looks backwards but it's intentional: on_hand_qty
   only changes at FULLY terminal statuses (see Prompt 4/5/6), so during a partial delivery
   on_hand_qty hasn't moved yet and reserved_qty is exactly what's covering that gap. The two
   numbers are designed to be read together.

3. get_sales_order_line_total(line) -> Decimal:
   if parent SalesOrder.status in ('draft', 'confirmed'): ordered_qty * sales_price
   else: delivered_qty * sales_price  (partially_delivered / fully_delivered)
   This mirrors the literal wireframe text: "Total : Ordered Quantity * Sales Price (once
   delivered it should be delivered quantity * Sales Price)". Same pattern for
   get_purchase_order_line_total using ordered_qty/received_qty * cost_price.

Write a quick pytest for adjust_stock that fires two concurrent calls (simulate with two DB
sessions) against the same product and confirms qty_after never produces an inconsistent result —
this is EC-3 from the locked decisions and is worth the 30 minutes.
```

---

## PROMPT 3 — Audit log helper

```
Create backend/app/services/audit_service.py with one function:
  log_change(db, user_id, module: str, record_type: str, record_id: UUID, action: str,
             field_changed: str | None = None, old_value: str | None = None,
             new_value: str | None = None)
that inserts one AuditLog row.

Rule (locked decision, not optional): call this on SAVE and on STATUS TRANSITIONS only.
Never call it per-keystroke or per-field-blur from the frontend — that means every route handler
that creates/updates/confirms/cancels/delivers/receives/produces something calls log_change()
itself, server-side, once per meaningful change, not once per field. If a single save changes
five fields, that's either one 'updated' row per changed field (for the field/old/new columns to
mean anything) or one row with a summary — pick the per-field version, since the Audit Logs
table in the wireframe has explicit "Field Changed / Old Value / New Value" columns that only
make sense per-field. Just don't call it from a debounced onChange handler.

module values are exactly: 'Sales', 'Purchase', 'Manufacturing', 'BoM', 'Product' — these need
to match what the frontend's "Logs" button filter will query by module.
```

---

## PROMPT 4 — Sales Order module (backend)

```
Build backend/app/api/routes/sales_orders.py and the matching Pydantic schemas. Implement
exactly this state machine and these field-lock rules (literal wireframe text):

  Draft -> Confirmed -> Partially Delivered -> Fully Delivered
       -> Cancelled (from any non-terminal state)

Fields: customer_id (many2one, mandatory), customer_address (auto-populated from customer,
becomes readonly once Confirmed), salesperson_id (defaults to current logged-in user, editable),
product lines (each: product_id, ordered_qty, delivered_qty default 0, sales_price
auto-populated from Product.sales_price at line-add time).

Buttons / transitions:
  - Confirm: Draft -> Confirmed. On confirm: lock creation_date, customer_id, customer_address
    (readonly from here on). Hide the Confirm button once status changes.
    THIS IS WHERE THE PROCUREMENT TRIGGER FIRES (see Prompt 7) — re-read On Hand Qty fresh at
    this exact moment, not from when the SO was drafted (EC-4).
  - Deliver: accepts a delivered_qty update.
      - if delivered_qty == ordered_qty: status -> Fully Delivered. Lock ALL fields. Hide
        Deliver button. THIS IS THE ONLY MOMENT on_hand_qty decreases for this product —
        call adjust_stock(qty_change = -ordered_qty, movement_type='so_delivery',
        reference_type='SalesOrder', reference_id=so.id). Do this for EVERY line on the order.
      - if delivered_qty < ordered_qty: status -> Partially Delivered. Lock all fields except
        delivered_qty. Keep Deliver button visible. on_hand_qty does NOT change yet.
  - Cancel: status -> Cancelled, lock all fields. Per EC-1: if this SO had auto-triggered a
    Purchase/Manufacturing Order, do NOT cascade-cancel it — it stays alive as future stock.

Add a GET /sales-orders endpoint supporting list view (search by reference + customer name) and
a separate response shape for kanban view (grouped by status). Reference numbers auto-generate
as SO-000001 sequential, zero-padded to 6 digits.

Call audit_service.log_change on every status transition and on save of any tracked field
(customer, customer_address, product, ordered_qty, delivered_qty, sales_price, status, total —
"total" is computed via stock_service.get_sales_order_line_total, not stored, so log the computed
value at the moment it changes, not as a stored column).

Gate every endpoint with require_permission("Sales", <action>) from Prompt 1.
```

---

## PROMPT 5 — Purchase Order module (backend)

```
Mirror Prompt 4's structure exactly, but for Purchase Orders — Draft -> Confirmed ->
Partially Received -> Fully Received -> Cancelled. Vendor instead of Customer, cost_price
instead of sales_price, received_qty instead of delivered_qty, Receive button instead of
Deliver button.

The on_hand_qty increase happens ONLY at Fully Received (same terminal-only pattern as Sales):
adjust_stock(qty_change = +ordered_qty, movement_type='po_receipt', reference_type=
'PurchaseOrder', reference_id=po.id) for each line, fired exactly once, when received_qty
reaches ordered_qty.

Additionally: purchase_order_lines.batch_number should be settable on receive (for the recall
traceability feature) — make it an optional field on the receive request, not mandatory, so
basic receiving still works if a team member doesn't get to wiring batch numbers in time.

If auto_created=True and source_sales_order_id is set, expose that on the response so the
frontend can show "Auto-created from SO-000XXX" as a badge.

Reference numbers: PO-000001, sequential, same pattern as Sales.
Gate every endpoint with require_permission("Purchase", <action>).
```

---

## PROMPT 6 — Manufacturing Order module (backend) — the hardest one

```
Build backend/app/api/routes/manufacturing_orders.py. State machine:
  Draft -> Confirmed -> In Progress -> Done
       -> Cancelled (from any non-terminal state)

Fields: finished_product_id (many2one, mandatory), quantity, assignee_id, bom_id (dropdown
filtered to only show BOMs whose finished_product matches the selected finished_product_id —
literal rule: "if Finished Product is entered first, only bill of materials for that product
only").

Components section — populate from the selected BOM's bom_lines, scaled by quantity
(to_consume = bom_line.qty_per_unit * mo.quantity). If bom_id is null, show an empty components
table with an "add component manually" row instead of crashing (EC-6) — in that case to_consume
is a manually-entered field, mirroring consumed_qty.
  - consumed_qty: hidden until status is Confirmed, manually entered (numeric), becomes readonly
    once status is Done or Cancelled.
  - Availability display: literal spec says show "Available" only if free_to_use_qty of the
    component EXACTLY EQUALS to_consume, else "Not Available". This is almost certainly meant as
    >= — build it as >= (free_to_use >= to_consume = Available) since the exact-match reading
    would mark a component "Not Available" even when you have MORE than enough, which is an
    obvious wireframe imprecision. Note this in a code comment in case a judge asks why.

Work Orders section — populate from bom_operations if present, else allow the user to add a line
manually (only while MO is Draft/Confirmed/In Progress).
  - expected_duration_min = bom_operations.expected_duration_min * mo.quantity (scales linearly
    — literal example: 10 min/unit at qty 1, MO qty 10 -> 100 min). Readonly once Done/Cancelled.
  - real_duration_min: HIDDEN while Draft. Editable while Confirmed/In Progress. Readonly once
    Done/Cancelled.
  - work_center: readonly once Done/Cancelled, otherwise editable, mandatory when adding an
    operation line.

Buttons:
  - Confirm: Draft -> Confirmed. Lock finished_product_id and bom_id from here on.
  - Start: Confirmed -> In Progress.
  - Produce: -> Done. Lock everything. THIS IS WHERE STOCK MOVES (terminal-only, same pattern as
    Sales/Purchase):
      - adjust_stock(qty_change = +quantity, movement_type='mo_produce', reference_type=
        'ManufacturingOrder', reference_id=mo.id) for the finished_product
      - for EACH component: adjust_stock(qty_change = -consumed_qty, movement_type='mo_consume',
        reference_type='ManufacturingOrder', reference_id=mo.id)
      - do all of this inside ONE database transaction — if any component's adjust_stock call
        fails (e.g. would go negative), roll back the whole Produce action, don't half-produce.
  - Cancel: -> Cancelled, lock all fields.

Recursive cascade (DriveForge-specific, do this AFTER the above works end-to-end for a single
non-recursive MO — don't attempt this first):
  When an MO is auto-created (Prompt 7) for a sub_assembly product, and that sub-assembly's own
  BOM has components that are themselves short on stock and are flagged procure_on_demand with
  procurement_type='manufacturing', auto-create a CHILD ManufacturingOrder with parent_mo_id
  pointing at this MO. Do not let the parent MO be marked Done until you've at minimum surfaced
  in the response whether it has open child MOs — don't silently let a parent "Produce" succeed
  while a child MO it depends on is still Draft, that's a guaranteed live-demo bug.

Gate everything with require_permission("Manufacturing", <action>). Note "Production Entry" is
listed as a distinct action from "Edit" in the permission table — manufacturing role gets
view+create (Production Entry) but the route layer should still allow assignee field updates as
part of that, just not BOM edits (that's Admin-only per spec, gate BOM edit endpoints separately).
```

---

## PROMPT 7 — Procurement automation trigger (cross-module, wire last)

```
Create backend/app/services/procurement_service.py with one function:
  check_and_trigger_procurement(db, sales_order_line, user_id) -> PurchaseOrder | ManufacturingOrder | None

Call this from inside the Sales Order Confirm endpoint (Prompt 4), once per line, AFTER the SO
status has been set to Confirmed but BEFORE the transaction commits.

Logic (these are locked decisions — EC-2, EC-3, EC-4 — do not deviate):
  1. Re-read the product fresh with SELECT ... FOR UPDATE inside the current transaction
     (this is the row lock from EC-3 — it must be the SAME lock used by adjust_stock, so two
     SOs confirming back-to-back for the same product serialize correctly instead of both
     reading On Hand=5 and both creating a full-shortfall order).
  2. Check: if NOT product.procure_on_demand, return None immediately — no order is created.
  3. shortage = sales_order_line.ordered_qty - product.on_hand_qty
     Trigger condition is STRICTLY less-than: only proceed if product.on_hand_qty < ordered_qty.
     NOT <=. Getting this backwards creates a 0-quantity PO/MO live in front of judges.
     IMPORTANT: this check uses On Hand Qty, NOT Free To Use Qty — that's the literal spec
     wording ("If On Hand Qty is less then Sales Order Qty"). Don't substitute free_to_use here
     even though it feels more "correct" — it isn't what's written.
  4. If procurement_type == 'purchase': create a PurchaseOrder (auto_created=True,
     source_sales_order_id=sales_order_line.sales_order_id, vendor_id=product.vendor_id,
     status='draft') with one line for `shortage` qty at product.cost_price.
     If procurement_type == 'manufacturing': create a ManufacturingOrder (auto_created=True,
     source_sales_order_id=..., bom_id=product.default_bom_id, quantity=shortage, status=
     'draft' — do NOT auto-confirm it, a Manufacturing user should review and confirm it
     themselves, that's a deliberate design choice, not an oversight).
  5. Write an audit_service.log_change for the auto-created order (action='created').

This function must be called from inside the SAME database transaction as the SO confirm, so
that if anything after it fails, the auto-created PO/MO rolls back too — you never want an
orphaned auto-PO sitting around for an SO confirm that ultimately failed.
```

---

## PROMPT 8 — Dashboard aggregate endpoint

```
Add GET /dashboard/summary returning: total_sales_orders, pending_deliveries (SOs in Confirmed
or Partially Delivered), total_manufacturing_orders, delayed_orders (MOs past scheduled_date and
not yet Done/Cancelled), total_purchase_orders, partial_receipts (POs in Partially Received).
Single query per metric is fine for hackathon scale, no need to optimize. Gate with
require_permission — Business Owner role should see this, Admin (is_system_admin) always can.
```

---

## PROMPT 9 — Frontend foundation (Tailwind + routing + shell)

```
Set up Tailwind in odoo_hackathon/frontend (it's currently a bare Vite+React+TS scaffold with no
Tailwind config) — install tailwindcss, postcss, autoprefixer, configure content paths for
src/**/*.{ts,tsx}, wire the base layer into src/index.css.

Install react-router-dom and set up routes for: /login, /signup, /admin (System Administrator
Dashboard), /dashboard (regular ERP Dashboard), /sales, /purchase, /manufacturing, /products,
/bom, /audit-logs, /users (admin-only).

Build the app shell matching the wireframe: a left "Master Menu" sidebar (Sale Orders, Purchase
Orders, Manufacturing Orders, Bills of Materials, Products, Audit Logs — each with its own
sub-icons for "New" and "Search"), a top bar with App Logo+Name on the left and a user login
avatar on the right that opens the current user's profile.

Build two separate login pages (not one page with a toggle) matching the wireframe split:
  - /login -> "Login for System User" (Login Id, Password, Forget Password? | Sign Up links,
    error message exactly "Invalid Login Id or Password" on failure)
  - /login/admin -> "Login for System Administrator" (same fields, different heading)
  - /signup -> Login Id, Password, Re-Enter Password, Email Id, with inline validation messages
    for the three rules: login_id 6-12 chars, no duplicate email, password complexity
    (lowercase + uppercase + special char + 8+ length) — validate client-side AND rely on the
    backend's 422 responses as the source of truth, don't trust client validation alone.

Use React Context (not Redux) for the logged-in user + JWT, since this is a 24h build and Context
is enough. Store the JWT in memory + a single httpOnly-style approach is overkill for a hackathon
— localStorage is fine here, just don't put anything sensitive beyond the token in it.
```

---

## PROMPT 10 — Frontend: Sales Order list, kanban, and form views

```
Build three views for Sales Orders, matching the wireframe layout:

1. List view: searchable by reference AND customer name (literal wireframe note: "Allow user to
   search records based on reference & contacts"), a button to switch to kanban view, columns
   for reference/customer/status/total.

2. Kanban view: cards grouped into columns by status (Draft / Confirmed / Partially Delivered /
   Fully Delivered / Cancelled), each card showing reference (e.g. SO-000001), customer name,
   status badge, and a relative date label ("Tomorrow" / "Yesterday" style — compute relative to
   today, don't hardcode).

3. Form view: all fields from the backend's Sales Order schema, with field-disabled states driven
   by the order's current status (don't hardcode per-field disabled logic in five different
   places — write one `getFieldLockState(status, fieldName)` helper and use it everywhere). Show
   Confirm/Deliver/Cancel/Back buttons conditionally per the state machine from Prompt 4. Include
   a "Logs" button that opens the Audit Logs view pre-filtered to module=Sales and
   record_id=<this SO's id>.

Show a warning banner (not a blocking error) on the form if ordered_qty for any line exceeds the
product's free_to_use_qty at the moment of typing — this is informational per the spec
("Availability: If Ordered Quantity is greater than Free to use quantity on product"), it should
NOT block saving or confirming.
```

---

## PROMPT 11 — Frontend: Purchase Order list, kanban, and form views

```
Mirror Prompt 10 exactly but for Purchase Orders: Vendor instead of Customer, Receive button
instead of Deliver, cost_price instead of sales_price, kanban columns Draft/Confirmed/
Partially Received/Fully Received/Cancelled. Show an "Auto-created from SO-000XXX" badge on the
form when auto_created is true (from Prompt 5's backend field).
```

---

## PROMPT 12 — Frontend: Manufacturing Order + BoM views

```
Build Manufacturing Order list/kanban/form views mirroring Prompts 10-11's pattern, plus the
Components and Work Orders sections as editable sub-tables inside the form (not separate pages).
Components table columns: Product, To Consume, Consumed, Availability (colored badge). Work
Orders table columns: Operation, Work Center, Expected Duration, Real Duration — Real Duration
column should literally not render at all while status is Draft (not just disabled — hidden),
per the locked rule from Prompt 6.

Build a separate Bill of Materials list/form view: Reference (auto-generated BOM-000001), Finished
Product (many2one, fetches from product database), Quantity, Components sub-table, Operations
sub-table. Note from the wireframe: "All fields of BoM should populate on manufacturing order, if
BoM is selected on it" — so when a BOM is selected on the MO form, the frontend should pull and
display its components/operations immediately, not wait for a separate save.
```

---

## PROMPT 13 — Frontend: Products, Audit Logs, User Management

```
1. Products: list + form view. Form fields: Product name, Sales Price, Cost Price, On Hand Qty
   (readonly, computed), Free to Use Qty (readonly, computed via the stock_service endpoint),
   Procure on Demand checkbox that conditionally reveals Procurement Type dropdown ->
   Vendor field (if Purchase) or BoM field (if Manufacturing).

2. Audit Logs: a filterable table (date range, user, module, action type) with four summary cards
   at the top — Total Logs, Create Actions, Update Actions, Delete Actions — each showing a count
   for the currently filtered range. Columns: Date & Time, User, Module, Record Type, Record ID,
   Action, Field Changed, Old Value, New Value.

3. User Management (is_system_admin only): a user list, a "User Login Detail Management" panel
   showing Name/Address/Mobile/Email/Login Id/Position with photo upload, and a simplified
   role-assignment control (a single role dropdown: sales/purchase/manufacturing/inventory/owner)
   rather than the wireframe's full per-field permission grid — that per-user grid was
   deliberately descoped for the hackathon timeline (locked decision, see schema notes), don't
   rebuild it. Position field is editable here (admin-only) but readonly on the user's own
   profile view.
```

---

## PROMPT 14 — Frontend: main dashboard

```
Build the main ERP Dashboard (the non-admin one) with six cards wired to GET /dashboard/summary
from Prompt 8: Total Sales Orders, Pending Deliveries, Manufacturing Orders, Delayed Orders,
Total Purchase Orders, Partial Receipts. Use simple stat cards, not charts, for the hackathon
timeline — a chart library is a nice-to-have, not worth the time against a working number.
```

---

## Cut list, if you're behind at hour 16-18 (priority order, top = cut first)

1. Recall management (v_recall_lookup, batch_number wiring) — biggest schema/UI cost, lowest
   judging weight relative to cost.
2. Multi-level BOM cascade depth beyond one level (vehicle -> sub-assembly is enough; sub-assembly
   -> sub-sub-assembly is the stretch).
3. VIN number generation — cheap to re-add later if time allows, cut first among the "DriveForge
   flavor" features only if truly out of time.
4. Road Test pass/fail gate on work orders.
5. AI components (demand forecasting, anomaly detection, live BOM explosion animation) — these
   were never core, they're differentiators for if everything above is solid with time to spare.

Never cut: the procurement automation trigger (Prompt 7) and the terminal-only stock movement
rule (Prompts 4-6). Those are the two things that separate "we built four CRUD apps" from "we
built an ERP," and they're also the cheapest to get right if built in the right order — which is
exactly the order above.
