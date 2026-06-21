# E2E Testing - Supply Chain Workflow

This directory contains end-to-end tests for the complete supply chain workflow using Playwright.

## Prerequisites

1. **Backend running** at `http://localhost:8000`
   ```bash
   cd backend
   uvicorn app.main:app --reload --port 8000
   ```

2. **Seed data loaded**
   ```bash
   cd backend
   python seed_demo_data.py
   ```

3. **Frontend running** at `http://localhost:5173`
   ```bash
   cd frontend
   npm run dev
   ```

## Test Users (from seed data)

| Role | Login ID | Password | Description |
|------|----------|----------|-------------|
| Admin | `adminuser` | `Admin@123` | System Administrator - can confirm orders |
| Sales | `salesuser` | `Sales@123` | Sales Representative |
| Manufacturing | `mfguser` | `Mfg@123` | Manufacturing Lead |
| Purchase | `purchaseuser` | `Purchase@123` | Purchase Manager |

## Running Tests

```bash
cd frontend

# Run all E2E tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui

# Run with visible browser (headed mode)
npm run test:e2e:headed
```

## Test Workflow

The main test (`supply-chain-workflow.spec.ts`) executes a complete MTO (Make-to-Order) workflow:

1. **Phase 1: Sales Order Creation** (salesuser)
   - Login as salesuser
   - Create new Sales Order for "Elite Auto Dealers"
   - Add 5x "Sedan CityDrive X1"
   - Save as Draft

2. **Phase 2: Executive Approval** (adminuser)
   - Login as adminuser
   - Confirm the Sales Order
   - This triggers auto-procurement (creates PO and MO)

3. **Phase 3: Procurement Approval** (adminuser)
   - Find the auto-generated Purchase Order (marked with AUTO tag)
   - Confirm the Purchase Order

4. **Phase 4: Receiving Inventory** (purchaseuser)
   - Login as purchaseuser
   - Open confirmed Purchase Order
   - Receive all items

5. **Phase 5: Manufacturing Production** (adminuser + mfguser)
   - adminuser confirms the Manufacturing Order
   - mfguser starts production
   - Set consumed quantities and mark work orders as pass
   - Produce (mark done)

6. **Phase 6: Final Delivery** (salesuser)
   - Login as salesuser
   - Open confirmed Sales Order
   - Deliver all items

7. **Phase 7: Verify Audit Trail** (adminuser)
   - Check audit logs to verify complete trail

## Troubleshooting

- If tests fail, ensure seed data is loaded
- Check that both backend and frontend are running
- Run with `--headed` flag to see what's happening in the browser
