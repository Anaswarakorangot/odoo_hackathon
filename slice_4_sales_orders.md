## SLICE 4 — Sales Order Module (Backend + Frontend)

**This is where the ERP logic starts.** Sales Orders have a state machine, field locks, and
terminal-only stock movement. The procurement trigger wires in at the end (after basic CRUD
proves it works). This is also the most judge-relevant module — they will absolutely ask to see
Sales Orders first.

---

## BACKEND — Sales Order Routes

Create `backend/app/api/routes/sales_orders.py` with these endpoints:

### POST /sales-orders
```
Request: SalesOrderCreateRequest
  - customer_id: UUID (many2one to customers, mandatory)
  - salesperson_id: UUID (many2one to users, optional — defaults to current_user)
  - line_items: list of {
      product_id: UUID (many2one to products, mandatory),
      ordered_qty: Decimal > 0 (mandatory)
    }

Response: SalesOrderResponse
  - id, reference (SO-000001 auto-generated), customer, customer_address (snapshot of
    customer.address at order-create time), salesperson, status (starts as 'draft'), lines
    (each: product, ordered_qty, delivered_qty=0, sales_price=snapshot from product at line-add
    time, line_total computed via stock_service.get_sales_order_line_total),
    total_amount (sum of line totals)

Audit: log_change(action='created')
Gate: require_permission("Sales", "create")
```

### GET /sales-orders
```
Query params: search (optional, searches by reference OR customer name), status (optional,
filters to a specific status)

Returns: list of SalesOrderResponse

Gate: require_permission("Sales", "view")
```

### GET /sales-orders/{id}
```
Returns: SalesOrderResponse (full detail, including line items)
Gate: require_permission("Sales", "view")
```

### POST /sales-orders/{id}/confirm
```
This is where the state machine and stock logic happen. No request body.

Rules:
  - Current status must be 'draft'. Return 409 if not.
  - Lock: SELECT sales_orders WHERE id={id} FOR UPDATE (serialize against concurrent confirms).
  - Set status → 'confirmed'.
  - Lock: SELECT products WHERE id=<each line's product_id> FOR UPDATE, re-read On Hand Qty
    fresh at this exact moment (EC-4 — never use a draft-time cached value).
  - For each line:
      - Availability check: if On Hand Qty < ordered_qty AND product.procure_on_demand=True,
        call check_and_trigger_procurement(line, current_user) from procurement_service.py
        (Prompt 7 wires this; for now, leave it stubbed or just don't call it yet).
      - Do NOT lock customer_id, customer_address, creation_date, or salesperson_id for edit at
        this point. Those lock on a different endpoint (see PATCH below).
  - Set fields readonly: creation_date, customer_id, customer_address (via a status-driven check
    in the PATCH route, not here).
  - Freeze the SO as confirmed but leave lines open for partial delivery.

Response: SalesOrderResponse with status='confirmed'
Audit: log_change(action='status_changed', field_changed='status', old_value='draft',
       new_value='confirmed')
Gate: require_permission("Sales", "approve")  ← This is Admin-only per the wireframe
Error: 403 if user lacks "approve" on Sales; 409 if status is not draft; 404 if SO not found.
```

### PATCH /sales-orders/{id}
```
Request: SalesOrderUpdateRequest (all fields optional)
  - salesperson_id, customer_id, customer_address, lines (with product_id, ordered_qty,
    delivered_qty per line — but see field-lock rules below)

Rules:
  - If status in ('draft'): all fields editable.
  - If status in ('confirmed', 'partially_delivered'): customer_id, customer_address, lines
    product_id and ordered_qty are readonly; only delivered_qty is editable (that's a PATCH,
    not a full state transition). salesperson_id is still editable.
  - If status in ('fully_delivered', 'cancelled'): all fields readonly, return 409 or just
    don't accept PATCH at all (frozen).

For any line update:
  - delivered_qty must be <= ordered_qty, obviously.
  - Sales price is immutable once set (line was created with this price snapshot, don't let
    edits change it).

Response: SalesOrderResponse
Audit: log_change(...) for each field that changed (per-field, not a summary)
Gate: require_permission("Sales", "edit")
```

### POST /sales-orders/{id}/deliver
```
Request: SalesOrderDeliverRequest
  - lines: list of { line_id: UUID, delivered_qty: Decimal }

This is the key state-transition endpoint. It's not a PATCH — it's a distinct action that
changes stock and status.

Rules:
  - Current status must be 'confirmed' or 'partially_delivered'. Return 409 otherwise.
  - For each line in the request:
      - Update the database line's delivered_qty += request delivered_qty (accumulate, not
        replace).
      - Check: has delivered_qty now reached ordered_qty for this line?
  - After updating all lines, check SO-level: if ALL lines have delivered_qty == ordered_qty:
      - Status → 'fully_delivered'. Lock all fields readonly (set a flag or field in the DB).
      - Stock movement happens HERE (and only here) — call adjust_stock(qty_change=-line.ordered_qty,
        movement_type='so_delivery', reference_type='SalesOrder', reference_id=so.id) for EACH
        line that just completed delivery (delivered_qty == ordered_qty for the first time). Do
        all these calls inside one DB transaction; if any fails, rollback the whole deliver
        action.
    - Else (some lines still have undelivered qty):
      - Status → 'partially_delivered'. Keep all fields locked except line.delivered_qty.
  - After stock adjustments, reserved_qty cache needs refreshing (if using the cached column
    from Slice 3; if you went with compute-on-read, this is invisible).

Response: SalesOrderResponse with updated status and line items
Audit: log_change(action='status_changed', ...) AND log_change for each delivered_qty that
       changed per line (or one summary log per line, your call)
Gate: require_permission("Sales", "edit")  ← Note: NOT approve, just edit. Only Confirm needs
      approve.
Error: 409 if status is not confirmed/partially_delivered; 400 if any delivered_qty > ordered_qty
```

### POST /sales-orders/{id}/cancel
```
No request body.

Rules:
  - Can cancel from any non-terminal state (draft, confirmed, partially_delivered).
  - Status → 'cancelled'. Lock all fields.
  - Per EC-1: if this SO auto-triggered a Manufacturing/Purchase order (source_sales_order_id
    is set on that order), do NOT cascade-cancel it — it stays alive as future stock.
  - Do NOT reverse any stock movements that already happened (if the SO was already partially
    delivered, on_hand_qty already decreased; cancelling the SO doesn't undo that).

Response: SalesOrderResponse with status='cancelled'
Audit: log_change(action='status_changed', field_changed='status', old_value=<old>,
       new_value='cancelled')
Gate: require_permission("Sales", "edit")
```

### DELETE /sales-orders/{id}
```
Only allow if status is 'draft' (can't delete a confirmed or delivered order, that would lose
audit trail). Return 409 otherwise.

Audit: log_change(action='deleted')
Gate: require_permission("Sales", "delete")
```

---

### Helper: reference number generation

Add a function in models/sales.py or a standalone helper:

```python
def get_next_so_reference(db: Session) -> str:
    """
    SELECT COALESCE(MAX(CAST(SUBSTR(reference, 4) AS INTEGER)), 0) + 1 FROM sales_orders
    Returns "SO-000001", "SO-000002", etc., zero-padded to 6 digits.
    """
```

Call this in POST /sales-orders before inserting the new SO.

---

## FRONTEND — Sales Order Module

Create in `frontend/src/pages/sales/`:

### SalesOrdersList.tsx
- Table view (default), search bar (by reference or customer name), buttons for Kanban view
  switch.
- Columns: Reference, Customer, Status (badge with color: draft=gray, confirmed=blue,
  partially_delivered=orange, fully_delivered=green, cancelled=red), Total, Actions.
- Per-row actions: View Detail (opens form), Cancel (if status != fully_delivered/cancelled),
  Delete (if status='draft' only).
- "+ New Sales Order" button → opens SalesOrderForm in create mode.

### SalesOrdersKanban.tsx
- Four columns (or five if including cancelled): Draft, Confirmed, Partially Delivered, Fully
  Delivered, Cancelled.
- Each column is a scrollable list of cards.
- Card shows: Reference (e.g., SO-000001), Customer name, Total amount, relative date
  ("Today", "Tomorrow", "5 days ago" style).
- Card is clickable → opens SalesOrderForm in view/edit mode.
- No drag-drop needed for hackathon — just visual grouping.

### SalesOrdersForm.tsx
- Create mode: fields for customer (dropdown), salesperson (optional), blank lines section
  (add-line button).
- View/Edit mode: same fields but with status-driven field-lock logic:
    - status='draft': all fields editable
    - status='confirmed' or 'partially_delivered': customer_id/address readonly, lines
      product/ordered_qty readonly, only delivered_qty editable, salesperson still editable
    - status='fully_delivered' or 'cancelled': entire form readonly except a "Close" button

- Lines sub-table (editable, sortable by order):
    - Columns: Product (dropdown), Ordered Qty (numeric), Delivered Qty (numeric, readonly until
      Deliver button is clicked), Sales Price (display-only, not editable), Line Total
      (computed on-the-fly: stock_service.get_sales_order_line_total), Actions (delete button
      only in draft).
  - Below the table: Order Total (sum of line totals).

- Buttons (conditional per status):
    - Draft: Save, Confirm, Cancel, Delete.
    - Confirmed or Partially Delivered: Deliver (opens a modal to enter delivered_qty per line),
      Cancel.
    - Fully Delivered or Cancelled: Close (just closes the form, no action).

- Deliver modal (appears when Deliver button clicked):
    - Shows a row per line with: Product, Ordered Qty (readonly), Current Delivered Qty
      (readonly), Enter New Delivered (numeric input).
    - Button: "Deliver" (submits), "Cancel" (closes modal).
    - On submit, POST /sales-orders/{id}/deliver with the new delivered_qty values.
    - After successful deliver, close the modal, refresh the form (on_hand_qty in Products
      should now change if fully_delivered).

- Availability warning (informational, not blocking):
    - Below each line, if ordered_qty > free_to_use_qty, show: "⚠️ Availability: Ordered
      quantity exceeds available stock (free to use: X, ordered: Y). Procurement may be
      triggered on confirm."
    - This is non-blocking per the spec — it's a heads-up, not a validation error.

- Logs button:
    - Opens the Audit Logs page pre-filtered to module='Sales' and record_id=<this SO's id>.

### SalesOrdersRouter in App.tsx
- Add /sales route. Default to ProductsList, with sub-routes:
    - /sales → SalesOrdersList (default)
    - /sales/:id → SalesOrdersForm (detail/edit)

---

## Procurement Trigger Integration (wire this LAST in Slice 4)

Once the basic Sales Order CRUD+state-machine is working, wire the procurement trigger:

In `backend/app/services/procurement_service.py`, create:

```python
def check_and_trigger_procurement(db: Session, so_line: SalesOrderLine,
                                   user_id: UUID) -> PurchaseOrder | ManufacturingOrder | None:
    """
    Called during POST /sales-orders/{id}/confirm, once per line, in the same DB transaction
    as the SO confirm.
    
    Returns the auto-created PO or MO if one was created, None if no procurement needed.
    """
    product = db.query(Product).filter_by(id=so_line.product_id).with_for_update().first()
    
    # EC-2: strictly <, never <=
    shortage = so_line.ordered_qty - product.on_hand_qty
    if shortage <= 0 or not product.procure_on_demand:
        return None
    
    # EC-3: row lock already held via with_for_update above
    
    # EC-4: re-read fresh (just did that above)
    
    if product.procurement_type == 'purchase':
        # Auto-create PO (Draft status)
        po = PurchaseOrder(
            reference=get_next_po_reference(db),
            vendor_id=product.vendor_id,
            status='draft',
            auto_created=True,
            source_sales_order_id=so_line.sales_order_id,
            created_by=user_id
        )
        po_line = PurchaseOrderLine(
            product_id=so_line.product_id,
            ordered_qty=shortage,
            cost_price=product.cost_price
        )
        po.lines.append(po_line)
        db.add(po)
        audit_service.log_change(db, user_id, 'Purchase', 'PurchaseOrder', po.id,
                                 'created', None, None, None)
        return po
    
    elif product.procurement_type == 'manufacturing':
        # Auto-create MO (Draft status)
        mo = ManufacturingOrder(
            reference=get_next_mo_reference(db),
            finished_product_id=so_line.product_id,
            quantity=shortage,
            bom_id=product.default_bom_id,
            status='draft',
            auto_created=True,
            source_sales_order_id=so_line.sales_order_id,
            created_by=user_id
        )
        # Populate components from BoM if present
        if mo.bom_id:
            for bom_line in db.query(BomLine).filter_by(bom_id=mo.bom_id).all():
                mo_component = MoComponent(
                    component_product_id=bom_line.component_product_id,
                    to_consume=bom_line.qty_per_unit * shortage
                )
                mo.components.append(mo_component)
        db.add(mo)
        audit_service.log_change(db, user_id, 'Manufacturing', 'ManufacturingOrder', mo.id,
                                 'created', None, None, None)
        return mo
    
    return None
```

Then in POST /sales-orders/{id}/confirm, after status is set to 'confirmed':

```python
for line in so.lines:
    auto_order = check_and_trigger_procurement(db, line, current_user.id)
    if auto_order:
        log it or just let audit_service handle it (already does above)
```

The whole confirm should be one transaction — if procurement_service raises an error, the
confirm rolls back too.

---

## Demo Checkpoint — Slice 4 Done

This is the most impressive demo yet. Script this exactly:

1. Go to Products, create "Gear Lube" with Sales Price 500, Cost 300, Procure on Demand OFF (MTS
   scenario). Manually set on_hand_qty = 50 via SQL (INSERT via API not yet built):
   ```sql
   UPDATE products SET on_hand_qty = 50 WHERE name = 'Gear Lube';
   ```

2. Go to Sales Orders, "+ New Sales Order".
3. Select a customer (create one via SQL if needed: INSERT INTO customers ...)
4. Add a line: product=Gear Lube, ordered_qty=20.
5. Total shows 10,000 (20 * 500).
6. Click Confirm → status becomes Confirmed, customer field locks (readonly).
7. Click Deliver → modal pops up, show "Deliver 20 units of Gear Lube". Enter 10 in the modal,
   click Deliver.
8. Form refreshes, status is now Partially Delivered, Delivered Qty shows 10, On_hand_qty in
   Products still shows 50 (hasn't moved yet — terminal-only rule).
9. Click Deliver again, enter the remaining 10.
10. Form refreshes, status is now Fully Delivered, all fields lock. Open Products and view
    Gear Lube's stock — On Hand now shows 30 (50 - 20), Free to Use shows 30.

That full sequence proves: state machine works, field locks work, terminal-only stock movement
works, and the audit trail captured it all.

**THEN (optional, if you want to show the wow-moment early):**

11. Go to Products, create "Widgets" with Sales Price 100, Cost 60, Procure on Demand ON,
    Procurement Type = Manufacturing, BoM = <an existing BOM you seeded>, On_hand_qty = 5.
12. Go to Sales Orders, "+ New".
13. Add a line: product=Widgets, ordered_qty=12 (shortage = 7).
14. Click Confirm.
15. **Immediately** go to Manufacturing Orders → you should see a new Draft MO for 7 Widgets
    with source_sales_order_id pointing back at the SO you just confirmed. That's the
    procurement trigger firing.

If that works, you've just shown the single most important feature of an ERP: one action
(confirm a sales order) triggered automatic procurement. Judges will notice this.

---

## Notes for building

- The state machine is the trickiest part. Draw out the allowed transitions as a diagram before
  coding — it'll save debugging time:
  ```
  draft ──confirm──> confirmed ──deliver──> partially_delivered ──deliver──> fully_delivered
   │                     │                          │
   └─────────cancel──────┴──────────cancel──────────┘
  ```

- Field locks should be driven by status, not hardcoded per-field. Write a helper:
  ```python
  def get_field_lock_state(status: str, field_name: str) -> bool:
      # Returns True if field is readonly in this status
  ```

- Don't wire the procurement trigger until basic Sales Order CRUD works end-to-end (create,
  confirm, deliver, fully deliver). Then add the trigger. Separating them means you can debug
  each independently.

- The Deliver button is its own state transition (like Confirm), not just a PATCH. This is
  important — it's where stock moves and status changes together atomically.
