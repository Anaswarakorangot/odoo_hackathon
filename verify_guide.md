# DriveForge ERP — Verification Guide

---

## Slice 4 (Sales Orders & Auto-procurement)

### Method 1: Automated Script

```powershell
cd c:\Users\Admin\Desktop\odoo_hackathon\backend
.\venv\Scripts\python C:/Users/Admin/.gemini/antigravity-ide/brain/1c61adc9-0c33-4208-b658-97f53c986f03/scratch/verify_slice4.py
```

### Method 2: Manual via Web UI
Login at `http://localhost:5173/` → **Login ID**: `anu7012` / **Password**: `NewPassword123!`

See detailed steps below for MTS and MTO flows.

---

## Slice 5 — Round 2 Backend B: Manufacturing Orders + BoM

### Method 1: Automated Script (Fastest — runs all 19 checks)

```powershell
cd c:\Users\Admin\Desktop\odoo_hackathon\backend
.\venv\Scripts\python "C:/Users/Admin/.gemini/antigravity-ide/brain/1c61adc9-0c33-4208-b658-97f53c986f03/scratch/verify_slice_mo.py"
```

Expected output: `All checks passed! Manufacturing Orders + BoM fully verified.`

---

### Method 2: Manual via Swagger UI

The easiest way is **Swagger** at `http://localhost:8000/docs`

#### Step 1 — Authenticate in Swagger

1. Open `http://localhost:8000/docs`
2. Click **Authorize** (top right, lock icon)
3. Enter your admin credentials via the `/api/auth/login` endpoint first:
   - Click `POST /api/auth/login` → **Try it out** → **Execute**
   - Body:
     ```json
     { "login_id": "anu7012", "password": "NewPassword123!" }
     ```
   - Copy the `access_token` from the response
4. Click **Authorize** at the top, paste `Bearer <your_token>` in the value box

---

#### Step 2 — Create a Bill of Materials

1. In Swagger, find `POST /api/boms/`
2. Click **Try it out** → paste this body:
   ```json
   {
     "finished_product_id": "<any product id from GET /api/products>",
     "bom_lines": [
       { "component_product_id": "<another product id>", "qty_per_unit": "2.000" }
     ],
     "bom_operations": [
       { "sequence": 1, "operation_name": "Assembly", "work_center": "Line A", "expected_duration_min": 30 }
     ]
   }
   ```
3. Execute. You should get **201** with a `BOM-000xxx` reference.
4. **Copy the BoM `id`** from the response.

---

#### Step 3 — Create a Manufacturing Order

1. Find `POST /api/manufacturing-orders/`
2. Body:
   ```json
   {
     "finished_product_id": "<same product id as BoM>",
     "quantity": "5",
     "bom_id": "<bom id from step 2>",
     "scheduled_date": "2026-08-01"
   }
   ```
3. Execute → **201**. Check the response:
   - `status` = `"draft"`
   - `components` list should have **1 entry** with `to_consume = 10.0` (2 × 5)
   - `work_orders` list should have **1 entry** with `expected_duration_min = 150` (30 × 5)
4. **Copy the MO `id`**.

---

#### Step 4 — Run through the State Machine

| Step | Endpoint | Expected status |
|---|---|---|
| Confirm | `POST /api/manufacturing-orders/{id}/confirm` | `"confirmed"` |
| Start | `POST /api/manufacturing-orders/{id}/start` | `"in_progress"` |
| Produce | `POST /api/manufacturing-orders/{id}/produce` | `"done"` |

For each, just click **Try it out**, enter the MO id, and execute. No body needed.

---

#### Step 5 — Verify Stock Moved at Produce

After executing **Produce**:

1. Call `GET /api/products/{finished_product_id}` — the `on_hand_qty` should have **increased by 5**
2. Call `GET /api/products/{component_product_id}` — the `on_hand_qty` should have **decreased by 10** (consumed_qty defaults to `to_consume` if you don't edit it — but since we didn't edit consumed_qty it stays at 0, so no deduction. To see the deduction, do a PATCH to set consumed_qty before producing)

> **Tip**: To see the stock deduction, before clicking Produce, call `PATCH /api/manufacturing-orders/{id}` with:
> ```json
> { "components": [{ "component_id": "<comp id from MO response>", "consumed_qty": "8.000" }] }
> ```
> Then produce — component stock will go down by 8.

---

#### Step 6 — Test Error Cases

**Re-confirm a confirmed MO** → should return `409`

**Try to produce with insufficient stock**:
1. Create a new MO with the same BoM
2. Confirm → Start
3. PATCH to set consumed_qty to `999999`
4. Produce → should return `409 Insufficient stock...`
5. Verify the component stock is **unchanged** (no partial movement)

---

### Method 3: Manual via cURL / Postman

```bash
# 1. Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login_id":"anu7012","password":"NewPassword123!"}'

# 2. List BoMs
curl http://localhost:8000/api/boms/list \
  -H "Authorization: Bearer <token>"

# 3. List Manufacturing Orders
curl http://localhost:8000/api/manufacturing-orders/ \
  -H "Authorization: Bearer <token>"

# 4. Confirm an MO
curl -X POST http://localhost:8000/api/manufacturing-orders/<mo_id>/confirm \
  -H "Authorization: Bearer <token>"
```

---

## API Reference: Manufacturing Module

### BoM Endpoints
| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/boms` | Brief list (for dropdowns) |
| `GET` | `/api/boms/list` | Full list with line/op counts |
| `GET` | `/api/boms/{id}` | Detail with all lines + operations |
| `POST` | `/api/boms/` | Create (Admin only) |
| `PATCH` | `/api/boms/{id}` | Update (Admin only) |
| `DELETE` | `/api/boms/{id}` | Delete — blocked if any MO references it |

### Manufacturing Order Endpoints
| Method | URL | Notes |
|---|---|---|
| `POST` | `/api/manufacturing-orders/` | Create draft MO |
| `GET` | `/api/manufacturing-orders/` | List (`?status_filter=draft&search=MO-0`) |
| `GET` | `/api/manufacturing-orders/{id}` | Detail with stock availability per component |
| `PATCH` | `/api/manufacturing-orders/{id}` | Update (field locks by status) |
| `POST` | `/api/manufacturing-orders/{id}/confirm` | `draft → confirmed` |
| `POST` | `/api/manufacturing-orders/{id}/start` | `confirmed → in_progress` |
| `POST` | `/api/manufacturing-orders/{id}/produce` | `in_progress → done` (stock moves here) |
| `POST` | `/api/manufacturing-orders/{id}/cancel` | Any non-terminal → `cancelled` |
| `DELETE` | `/api/manufacturing-orders/{id}` | Draft only, Admin only |
