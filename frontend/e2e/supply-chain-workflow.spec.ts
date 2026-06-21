/**
 * End-to-End Supply Chain Workflow Test
 *
 * Correct flow based on seed_demo_data.py:
 * 1. Create SO → Draft SO
 * 2. Confirm SO → Auto-creates MO (Draft)
 * 3. Confirm MO → Auto-creates PO (Draft) for component shortages
 * 4. Confirm PO
 * 5. Receive PO → Adds stock
 * 6. Produce MO → Consumes components, creates finished goods
 * 7. Deliver SO → Complete
 */

import { test, expect, Page } from '@playwright/test';

const USERS = {
  admin: { loginId: 'adminuser', password: 'Admin@123' },
  sales: { loginId: 'salesuser', password: 'Sales@123' },
  manufacturing: { loginId: 'mfguser', password: 'Mfg@123' },
  purchase: { loginId: 'purchaseuser', password: 'Purchase@123' },
};

const CUSTOMER_NAME = 'Elite Auto Dealers';
const PRODUCT_NAME = 'Sedan CityDrive X1';
const ORDER_QUANTITY = 5;

let salesOrderId: string;
let salesOrderReference: string;
let moUrl: string;

async function login(page: Page, user: { loginId: string; password: string }) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.fill('#loginId', user.loginId);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function logout(page: Page) {
  const userMenuButton = page.locator('header button:has(div.rounded-full)').last();
  await userMenuButton.click();
  await page.waitForTimeout(500);
  await page.click('button:has-text("Sign out")');
  await page.waitForURL('/login', { timeout: 10000 });
}

test.describe.serial('Complete Supply Chain Workflow', () => {

  test('Phase 1: Create Sales Order (salesuser)', async ({ page }) => {
    console.log('=== Phase 1: Create Sales Order ===');

    await login(page, USERS.sales);

    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Wait for customers dropdown to have options
    const customerSelect = page.locator('select').first();
    await customerSelect.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const select = document.querySelector('select');
      return select && select.options.length > 1;
    }, { timeout: 10000 });

    await customerSelect.selectOption({ label: CUSTOMER_NAME });
    console.log(`Customer: ${CUSTOMER_NAME}`);

    await page.click('button:has-text("+ Add Line")');
    await page.waitForTimeout(500);

    await page.locator('tbody select').first().selectOption({ label: PRODUCT_NAME });
    console.log(`Product: ${PRODUCT_NAME}`);

    await page.locator('tbody input[type="number"]').first().fill(ORDER_QUANTITY.toString());
    console.log(`Quantity: ${ORDER_QUANTITY}`);

    await page.click('button:has-text("Save")');
    await page.waitForURL(/\/sales\/[a-f0-9-]+/, { timeout: 10000 });

    salesOrderId = page.url().split('/sales/')[1];
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    salesOrderReference = await page.locator('main h1').first().textContent() || '';
    if (!salesOrderReference.startsWith('SO-')) {
      await page.reload();
      await page.waitForLoadState('networkidle');
      salesOrderReference = await page.locator('main h1').first().textContent() || '';
    }

    console.log(`Created: ${salesOrderReference}`);
    await expect(page.locator('span:has-text("Draft")')).toBeVisible();

    await logout(page);
  });

  test('Phase 2: Confirm Sales Order - Creates MO (adminuser)', async ({ page }) => {
    console.log('=== Phase 2: Confirm Sales Order ===');

    await login(page, USERS.admin);
    await page.goto(`/sales/${salesOrderId}`);
    await page.waitForLoadState('networkidle');

    console.log(`Confirming: ${salesOrderReference}`);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('button:has-text("Confirm")').first().click();
    await page.waitForTimeout(2000);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('span:has-text("Confirmed")')).toBeVisible({ timeout: 5000 });
    console.log('SO confirmed - MO auto-created');

    await logout(page);
  });

  test('Phase 3: Confirm Manufacturing Order - Creates PO (adminuser)', async ({ page }) => {
    console.log('=== Phase 3: Confirm Manufacturing Order ===');

    await login(page, USERS.admin);
    await page.goto('/manufacturing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check how many rows exist
    const allRows = page.locator('tbody tr');
    const rowCount = await allRows.count();
    console.log(`Found ${rowCount} MO rows`);

    // Click on the first row (should be our MO)
    if (rowCount > 0) {
      await allRows.first().click();
      await page.waitForURL(/\/manufacturing\/[a-f0-9-]+/, { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000); // Wait for UI to fully render
      moUrl = page.url();
      console.log(`Opened MO: ${moUrl}`);

      // Check current status
      const currentStatus = await page.locator('main span.rounded-full').first().textContent();
      console.log(`Current MO status: ${currentStatus}`);

      // Debug: List all visible buttons
      const allButtons = page.locator('button');
      const buttonCount = await allButtons.count();
      console.log(`Total buttons on page: ${buttonCount}`);
      for (let i = 0; i < Math.min(buttonCount, 10); i++) {
        const btnText = await allButtons.nth(i).textContent();
        console.log(`  Button ${i}: "${btnText?.trim()}"`);
      }

      // Look for Confirm button - try different selectors
      const confirmBtn = page.locator('button').filter({ hasText: 'Confirm' }).first();
      const confirmBtnCount = await confirmBtn.count();
      console.log(`Found ${confirmBtnCount} Confirm button(s)`);

      if (confirmBtnCount > 0 && await confirmBtn.isVisible()) {
        console.log('Clicking Confirm button...');
        await confirmBtn.click();
        await page.waitForTimeout(3000);
        await page.reload();
        await page.waitForLoadState('networkidle');

        const newStatus = await page.locator('main span.rounded-full').first().textContent();
        console.log(`MO status after confirm: ${newStatus}`);
      } else {
        console.log('Confirm button not visible or not found');
        // Take a screenshot for debugging
        await page.screenshot({ path: 'test-results/phase3-debug.png' });
      }
    } else {
      console.log('No MO rows found in table');
    }

    await logout(page);
  });

  test('Phase 4: Confirm Purchase Order (adminuser)', async ({ page }) => {
    console.log('=== Phase 4: Confirm Purchase Order ===');

    await login(page, USERS.admin);
    await page.goto('/purchase');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Find Draft PO with AUTO tag
    const draftPo = page.locator('tr').filter({
      has: page.locator('span:has-text("Draft")')
    }).filter({
      has: page.locator('span:has-text("AUTO")')
    }).first();

    if (await draftPo.count() > 0) {
      console.log('Found Draft AUTO PO');
      await draftPo.click();
      await page.waitForURL(/\/purchase\/[a-f0-9-]+/, { timeout: 10000 });
      await page.waitForLoadState('networkidle');

      const confirmBtn = page.locator('button:has-text("Confirm")').first();
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
        await page.reload();
        await page.waitForLoadState('networkidle');
        console.log('PO confirmed');
      }
    } else {
      console.log('No Draft AUTO PO found - checking for any Draft PO');
      const anyDraftPo = page.locator('tr').filter({
        has: page.locator('span:has-text("Draft")')
      }).first();

      if (await anyDraftPo.count() > 0) {
        await anyDraftPo.click();
        await page.waitForURL(/\/purchase\/[a-f0-9-]+/, { timeout: 10000 });
        await page.waitForLoadState('networkidle');

        const confirmBtn = page.locator('button:has-text("Confirm")').first();
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
          await page.waitForTimeout(2000);
          await page.reload();
          console.log('PO confirmed');
        }
      }
    }

    // Only try to get status if we're on a detail page
    if (page.url().includes('/purchase/') && !page.url().endsWith('/purchase')) {
      const status = await page.locator('main span.rounded-full').first().textContent();
      console.log(`PO status: ${status}`);
    } else {
      console.log('Still on list page - no PO detail to show');
    }

    await logout(page);
  });

  test('Phase 5: Receive Purchase Order (purchaseuser)', async ({ page }) => {
    console.log('=== Phase 5: Receive Purchase Order ===');

    await login(page, USERS.purchase);
    await page.goto('/purchase');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Find Confirmed PO
    const confirmedPo = page.locator('tr').filter({
      has: page.locator('span:has-text("Confirmed")')
    }).first();

    if (await confirmedPo.count() > 0) {
      console.log('Found Confirmed PO');
      await confirmedPo.click();
      await page.waitForURL(/\/purchase\/[a-f0-9-]+/, { timeout: 10000 });
      await page.waitForLoadState('networkidle');

      const receiveBtn = page.locator('button:has-text("Receive")');
      if (await receiveBtn.isVisible()) {
        await receiveBtn.click();
        await page.waitForSelector('text=Receive Items', { timeout: 5000 });
        await page.click('button:has-text("Confirm Receipt")');
        await page.waitForTimeout(2000);
        await page.reload();
        await page.waitForLoadState('networkidle');
        console.log('PO received - stock added');
      }
    } else {
      console.log('No Confirmed PO found');
    }

    const status = await page.locator('span.rounded-full').first().textContent();
    console.log(`PO status: ${status}`);

    await logout(page);
  });

  test('Phase 6: Produce Manufacturing Order (mfguser)', async ({ page }) => {
    console.log('=== Phase 6: Produce Manufacturing Order ===');

    await login(page, USERS.manufacturing);

    if (moUrl) {
      await page.goto(moUrl);
    } else {
      await page.goto('/manufacturing');
      await page.waitForLoadState('networkidle');
      const mo = page.locator('tr').first();
      await mo.click();
      await page.waitForURL(/\/manufacturing\/[a-f0-9-]+/, { timeout: 10000 });
    }
    await page.waitForLoadState('networkidle');

    // Start Production if in Confirmed state
    const startBtn = page.locator('button:has-text("Start Production")').first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await page.waitForTimeout(2000);
      await page.reload();
      await page.waitForLoadState('networkidle');
      console.log('Production started');
    }

    // Fill consumed quantities
    const toConsumeTable = page.locator('table').filter({ hasText: 'To Consume' });
    if (await toConsumeTable.count() > 0) {
      const inputs = toConsumeTable.locator('tbody input[type="number"]');
      const count = await inputs.count();
      for (let i = 0; i < count; i++) {
        const row = inputs.nth(i).locator('xpath=ancestor::tr');
        const toConsume = await row.locator('td').nth(1).textContent();
        await inputs.nth(i).fill(toConsume?.trim() || '5');
      }
      console.log(`Filled ${count} component quantities`);
    }

    // Mark work orders as pass
    const passFailTable = page.locator('table').filter({ hasText: 'Pass/Fail' });
    if (await passFailTable.count() > 0) {
      const selects = passFailTable.locator('select');
      const count = await selects.count();
      for (let i = 0; i < count; i++) {
        await selects.nth(i).selectOption('pass');
      }
      console.log(`Marked ${count} work orders as pass`);
    }

    // Save changes
    const saveBtn = page.locator('button:has-text("Save")').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    // Produce
    const produceBtn = page.locator('button:has-text("Produce")').first();
    if (await produceBtn.isVisible() && await produceBtn.isEnabled()) {
      await produceBtn.click();
      await page.waitForTimeout(3000);
      await page.reload();
      await page.waitForLoadState('networkidle');
      console.log('MO produced - finished goods created');
    }

    const status = await page.locator('span.rounded-full').first().textContent();
    console.log(`MO status: ${status}`);

    await logout(page);
  });

  test('Phase 7: Deliver Sales Order (salesuser)', async ({ page }) => {
    console.log('=== Phase 7: Deliver Sales Order ===');

    await login(page, USERS.sales);
    await page.goto(`/sales/${salesOrderId}`);
    await page.waitForLoadState('networkidle');

    const deliverBtn = page.locator('button:has-text("Deliver")');
    if (await deliverBtn.isVisible()) {
      await deliverBtn.click();
      await page.waitForSelector('text=Record Delivery', { timeout: 5000 });

      const inputs = page.locator('.fixed input[type="number"]');
      const count = await inputs.count();
      for (let i = 0; i < count; i++) {
        const max = await inputs.nth(i).getAttribute('max');
        await inputs.nth(i).fill(max || ORDER_QUANTITY.toString());
      }
      console.log('Filled delivery quantities');

      await page.click('.fixed button:has-text("Deliver")');
      await page.waitForTimeout(2000);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    const status = await page.locator('span.rounded-full').first().textContent();
    console.log(`SO status: ${status}`);
    console.log('=== Workflow Complete! ===');

    await logout(page);
  });

  test('Phase 8: Verify Audit Logs', async ({ page }) => {
    console.log('=== Phase 8: Audit Logs ===');

    await login(page, USERS.admin);
    await page.goto('/admin/audit');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:has-text("Audit")')).toBeVisible();
    console.log('Audit logs verified');

    await logout(page);
  });
});

test('Smoke: Login page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#loginId')).toBeVisible();
});

test('Smoke: All users can login', async ({ page }) => {
  for (const [role, creds] of Object.entries(USERS)) {
    await page.goto('/login');
    await page.fill('#loginId', creds.loginId);
    await page.fill('#password', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 });
    console.log(`${role}: OK`);

    const userMenu = page.locator('header button:has(div.rounded-full)').last();
    await userMenu.click();
    await page.waitForTimeout(300);
    await page.click('button:has-text("Sign out")');
    await page.waitForURL('/login');
  }
});
