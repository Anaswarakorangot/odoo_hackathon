## SLICE 3 — Products Module (Backend + Frontend)

**This is your first fully visible vertical slice.** After this, you can show evaluators a real
module: create a product, see it in a list, see the computed stock fields update correctly.
No state machine complexity yet — just CRUD + computed fields. The build is fast because there's
no business logic, just data persistence.

---

## BACKEND — Products Routes

Create `backend/app/api/routes/products.py` with these endpoints:

```
POST /products
  Request: ProductCreateRequest (name, sales_price, cost_price, procure_on_demand, 
           procurement_type nullable, vendor_id nullable, default_bom_id nullable)
  Rules (literal wireframe):
    - name: required, unique
    - sales_price, cost_price: required, >= 0
    - procure_on_demand: boolean, optional (defaults False)
    - If procure_on_demand=True, procurement_type must be provided (purchase or manufacturing)
    - If procurement_type='purchase', vendor_id must be provided (many2one to vendors)
    - If procurement_type='manufacturing', default_bom_id must be provided (many2one to boms)
  Response: ProductResponse (id, name, sales_price, cost_price, on_hand_qty, reserved_qty,
            free_to_use_qty, procure_on_demand, procurement_type, vendor_id, default_bom_id)
  Gate: require_permission("Product", "create")
  Audit: log_change(action='created')

GET /products
  Returns: list of ProductResponse
  Gate: require_permission("Product", "view")

GET /products/{id}
  Returns: ProductResponse
  Gate: require_permission("Product", "view")

GET /products/{id}/stock
  Returns: { on_hand_qty, reserved_qty, free_to_use_qty } (computed live via
  stock_service.get_product_stock, not stored fields)
  Gate: require_permission("Product", "view")

PATCH /products/{id}
  Request: ProductUpdateRequest (all fields optional)
  Rules: Same validation as POST for any field being updated. Cannot change name (it's the
         unique identifier). Cannot change procure_on_demand or procurement_type once the
         product has any on_hand_qty > 0 (you can't flip a product's mode once it's in stock
         — this is a common ERP safety rule, not in the wireframe but sensible).
  Response: ProductResponse
  Gate: require_permission("Product", "edit")
  Audit: log_change(action='updated', field_changed=<field>, old_value=<old>, new_value=<new>)
         for each field that actually changed

DELETE /products/{id}
  Rules: Can only delete if on_hand_qty == 0 AND the product isn't referenced in any active
         (non-cancelled) Sales/Purchase/Manufacturing orders. Otherwise 409 Conflict.
  Gate: require_permission("Product", "delete")
  Audit: log_change(action='deleted')
```

All endpoints return 404 if product not found, 422 on validation failure with field-specific
errors, 403 on permission denial.

---

## FRONTEND — Products Module

Create three components in `frontend/src/pages/products/`:

### ProductsList.tsx
- List view, table with columns: Name, Sales Price, Cost Price, On Hand (read-only), Free to Use
  (read-only), Procure on Demand (checkbox, readonly), Actions.
- Action buttons per row: Edit (opens form modal), View Stock (shows detailed stock breakdown),
  Delete (if allowed by backend).
- Search by name (optional — exact match is fine for hackathon scale, not partial search).
- Button "New Product" that opens the form in create mode.
- Fetch GET /products on mount, refresh after any create/update/delete.

### ProductsForm.tsx (modal or inline, your choice)
- Fields: Name, Sales Price, Cost Price, Procure on Demand checkbox, Procurement Type dropdown
  (conditionally shown, required if ProcureOnDemand=true), Vendor dropdown (if Type=purchase),
  BoM dropdown (if Type=manufacturing).
- Disable name field if editing (name is immutable).
- On save, POST /products or PATCH /products/{id}, show field-specific error messages under the
  right fields if validation fails.
- After successful save, close the form and refresh the products list.

### ProductsRouter in App.tsx
- Add /products route, renders ProductsList by default.

---

## DEMO CHECKPOINT — Slice 3 Done

You now have a fully working CRUD module to show:
1. Create a product: "Office Chair", Sales Price 5000, Cost Price 3000, Procure on Demand
   unchecked.
2. View it in the list.
3. Click "View Stock" and see on_hand_qty=0, reserved_qty=0, free_to_use_qty=0.
4. Edit the product: change Sales Price to 5500, save, confirm the change persists and shows in
   the list.
5. Create another product with Procure on Demand checked, Type=Purchase, select a Vendor.
6. Go back to the Products list and show both products side by side.

This is proof the full stack works: database -> API with permission gates -> audit logs -> UI.
Show this to evaluators before moving to Slice 4 (Sales Orders), because it demonstrates you
have fundamentals working end-to-end, not just a backend API sitting there unused.

---

## Notes for building

- Don't overthink the UI — a simple table with a modal form is enough. The goal is to test the
  API, not to win a design award.
- On_hand_qty and free_to_use_qty should both be readonly everywhere (no direct edits) — they
  only change through stock movements (Sales delivery, PO receipt, MO production), which come
  later.
- The "can't delete if in-stock" rule from the backend should result in a 409 error on the
  frontend, which you should catch and show as a friendly message: "Cannot delete product in
  stock. Stock must be zero." Same for the "can't delete if referenced" case.
- The "can't change procure mode if on_hand_qty > 0" rule is your call whether to enforce on the
  frontend (disable the field) or just let the backend reject it. Either way works.
