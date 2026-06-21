# DriveForge Mini ERP — Vertical Slice Build Order

Restructured from the original backend-first sequence. Same prompt content, different order:
every slice below pairs backend + frontend for ONE module, so after each slice you have something
real to demo — not "trust me, the API works." This matters for live evaluation, where judges
checking in periodically need to see progress, not a finished backend and a blank screen.

Status: Slice 0 (models) done. Slice 1 (auth backend) running now.

---

## SLICE 1 — Auth + App Shell (backend running now, pair frontend next)

**Backend (running):** login_id-based login, two dashboards via is_system_admin, signup
validation (login_id 6-12 chars unique, email unique, password complexity), require_permission
dependency, role_permissions seed. [Full prompt unchanged from before — this is the one
currently executing.]

**Frontend (run as soon as backend's auth endpoints respond — don't wait for 100% backend
polish, a working /login + /signup that hits real endpoints is the goal):**
```
Set up Tailwind + react-router-dom in odoo_hackathon/frontend. Build the app shell: left
"Master Menu" sidebar, top bar with App Logo+Name and a user avatar. Build /login (System User),
/login/admin (System Administrator — same fields, different heading), /signup with inline
validation mirroring the backend's three rules. Use React Context for the logged-in user + JWT.
On successful login, route based on is_system_admin from the JWT payload: true -> /admin,
false -> /dashboard (a placeholder page is fine for now, just needs to render and show "logged
in as <name>").

DEMO CHECKPOINT: you should be able to sign up a real user, log in, and land on a dashboard
shell that shows who's logged in. This is your first thing to show evaluators — "auth works,
roles route correctly" — before any business module exists.
```

---

## SLICE 2 — Stock + Audit services (backend-only infra, fast — no frontend yet)

```
[Unchanged from before: Prompt 2 (stock_service.py — adjust_stock, get_product_stock,
get_sales_order_line_total/get_purchase_order_line_total) + Prompt 3 (audit_service.py —
log_change). No UI needed for these — they're plumbing every module below calls into. Keep this
slice short; it shouldn't take long and nothing downstream works correctly without it.]

DEMO CHECKPOINT: none yet, this is invisible infrastructure. Don't show this to evaluators on its
own — it pays off starting next slice.
```

---

## SLICE 3 — Products module (simplest module — fastest path to a complete vertical win)

**Backend:**
```
Build backend/app/api/routes/products.py: CRUD endpoints for Product, with procure_on_demand
conditionally requiring procurement_type, vendor_id (if Purchase) or default_bom_id (if
Manufacturing) — mandatory fields per the wireframe's literal rule. GET /products/{id}/stock
returns on_hand_qty/reserved_qty/free_to_use_qty via stock_service.get_product_stock (not stored
columns). Gate with require_permission("Product", action). Call audit_service.log_change on
create/update.
```

**Frontend:**
```
Build Products list view + form view. Form fields: name, sales_price, cost_price, on_hand_qty
(readonly), free_to_use_qty (readonly, fetched from /products/{id}/stock), Procure on Demand
checkbox that conditionally reveals Procurement Type -> Vendor or BoM field.

DEMO CHECKPOINT: this is your first fully real module — create a product, see it in the list,
see computed stock fields update. Show this to evaluators as proof the full stack (DB -> API ->
UI, with real permission gating) actually works end to end, before tackling anything with a
state machine. This is the "one module developed properly" milestone you're after.
```

---

## SLICE 4 — Sales Order module (most demo-critical — build this next while momentum is high)

**Backend:**
```
[Unchanged from before: Prompt 4 — full Draft -> Confirmed -> Partially/Fully Delivered ->
Cancelled state machine, field locks, terminal-only stock movement on Fully Delivered, line
totals via stock_service. Do NOT wire the procurement trigger yet — leave check_and_trigger_
procurement as a stub/no-op call for now, or skip calling it entirely. You want Sales Orders
demoable as a pure MTS flow (confirm -> deliver -> stock decreases) BEFORE adding the MTO
complexity on top. Wiring procurement now means you can't isolate bugs to "Sales" vs
"Sales+Purchase+Manufacturing all at once."]
```

**Frontend:**
```
[Unchanged from before: Prompt 10 — list view (search by reference + customer), kanban view
(grouped by status with relative date labels), form view with field-lock states driven by
status, Confirm/Deliver/Cancel/Back buttons, Logs button, availability warning banner.]

DEMO CHECKPOINT: create a customer, create a product with enough stock (MTS scenario — don't
test MTO yet, that needs Purchase+Manufacturing to exist), create a Sales Order, confirm it,
deliver it fully, watch on_hand_qty drop. This is your second real module and your most
judge-relevant one — Sales is what most people will ask to see first.
```

---

## SLICE 5 — Purchase Order module

**Backend:**
```
[Unchanged from before: Prompt 5 — mirrors Sales Order's state machine, Vendor instead of
Customer, Receive instead of Deliver, terminal-only stock increase on Fully Received.]
```

**Frontend:**
```
[Unchanged from before: Prompt 11 — mirrors Sales Order's three views.]

DEMO CHECKPOINT: create a vendor, create a Purchase Order, confirm it, receive it, watch
on_hand_qty increase. Third module done — at this point Sales and Purchase both work
independently, which is already more than a lot of hackathon teams will have.
```

---

## SLICE 6 — Manufacturing Order + BoM module (the hardest one — you have momentum now, tackle it)

**Backend:**
```
[Unchanged from before: Prompt 6 — Draft -> Confirmed -> In Progress -> Done state machine,
BoM-driven components/work orders, EC-6 manual-component fallback, terminal-only stock movement
on Produce (finished good +, components -, one transaction), recursive cascade for sub-assembly
shortages (build the single-level MO first, attempt recursion only once that works).]
```

**Frontend:**
```
[Unchanged from before: Prompt 12 — MO list/kanban/form with Components and Work Orders
sub-tables (Real Duration hidden in Draft, per the locked rule), plus a separate BoM list/form
view.]

DEMO CHECKPOINT: create a BoM for a product, create a Manufacturing Order, confirm -> start ->
produce, watch finished-good stock increase and component stock decrease in the same action.
Fourth module done — this is the one that took the longest, budget your remaining time knowing
that.
```

---

## SLICE 7 — Procurement automation trigger (the wow-moment — wire it now that everything it touches exists)

```
[Unchanged from before: Prompt 7 — check_and_trigger_procurement, called from Sales Order
Confirm, using On Hand Qty (not Free to Use) with strict < comparison, FOR UPDATE row lock,
auto-creates a Draft Purchase Order or Draft Manufacturing Order depending on procurement_type,
same DB transaction as the SO confirm.]

DEMO CHECKPOINT: this is the single most impressive thing you can show a judge. Set up a product
with low stock and Procure on Demand checked (Manufacturing type), confirm a Sales Order that
exceeds available stock, then go straight to the Manufacturing Orders list and show the
auto-created Draft MO sitting there with source_sales_order_id pointing back at the SO you just
confirmed. That's the moment that proves "this is a system, not four separate CRUD apps" — script
this exact sequence for your actual demo, don't improvise it live.
```

---

## SLICE 8 — Audit Logs view (backend mostly already exists via audit_service — this is mostly frontend)

**Backend:**
```
Add GET /audit-logs with filters: module, user_id, date range, action. audit_service already
writes the rows from every module above — this endpoint just needs to query and filter them.
```

**Frontend:**
```
[Unchanged from before: Prompt 13's audit log section — filterable table, four summary cards
(Total/Create/Update/Delete counts), and a "Logs" button on every module's form view that deep
links here pre-filtered to that module + record_id.]

DEMO CHECKPOINT: confirm a Sales Order, then open its Logs button, show the status-transition
row with old/new values. This is a small slice but a real "we built traceability, not just
features" signal.
```

---

## SLICE 9 — Dashboard + remaining admin screens

```
[Unchanged from before: Prompt 8 (dashboard aggregate endpoint) + Prompt 14 (dashboard cards) +
Prompt 13's User Management section (admin-only user list + simplified role-assignment dropdown,
NOT the full per-field grid — still descoped per the locked decision).]

DEMO CHECKPOINT: land on /dashboard after login and see real numbers reflecting everything
you've built. This is a good "closing slide" for a demo — show it last, after the individual
modules, as the "and here's the bird's-eye view" wrap-up.
```

---

## Cut list if you're behind (unchanged — still applies, now mapped to slices)

If you're behind at hour 16-18, cut in this order:
1. Slice 6's recursive cascade beyond one level, and recall/batch tracking — highest cost, lowest
   judging weight.
2. Slice 6's VIN generation and Road Test pass/fail — cheap to mention verbally as "designed for
   but not wired up" if truly out of time.
3. Slice 9's dashboard polish — a working number beats a chart you didn't finish.
4. Slice 8 (Audit Logs) only if you must — but try not to, "track logs" is in the spec's own
   bullet list and its absence is one of the more visible gaps a judge will notice.

Never cut: Slice 7 (procurement trigger) and the terminal-only stock movement rule baked into
Slices 4-6. If you have to choose between finishing Slice 7 properly and starting Slice 9, finish
Slice 7 — it's worth more to your score than the dashboard is.
