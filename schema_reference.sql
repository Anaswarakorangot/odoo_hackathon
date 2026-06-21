-- ============================================================
-- MINI ERP SCHEMA — DriveForge Motors  (v2 — gap-fix pass)
-- Implements: multi-level BoM, MTS/MTO procurement automation,
-- audit logging, role-based access, stock ledger, all EC-1..EC-7
-- decisions.
-- Postgres 14+
--
-- CHANGES FROM v1:
--   + stock_ledger table (movement journal — was missing entirely)
--   + users.login_id (6-12 char, separate from email, per wireframe)
--   + sales_order_lines.line_total / purchase_order_lines.line_total
--     as GENERATED STORED columns (computed, never free-typed)
--   + v_sales_order_totals / v_purchase_order_totals views
--   (role_permissions kept role-based; customer_id kept as FK —
--    see chat for why these two reviewer suggestions were rejected)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------
-- USERS & ROLES
-- ----------------------------
-- NOTE: no 'admin' value here on purpose. The wireframe's "System
-- Administrator" is a distinct concept from a module role — it's the
-- person who MANAGES other users' access, not just someone with full
-- access to one module. Modeling it as a role value alongside is_system_admin
-- would create two sources of truth that can drift (role='admin' but
-- is_system_admin=false, or vice versa). is_system_admin is authoritative;
-- when true, bypass role_permissions entirely (full access, per spec's
-- own "Admin: Full system access" line). Regular roles below only ever
-- need a role_permissions lookup.
CREATE TYPE role_enum AS ENUM ('sales', 'purchase', 'manufacturing', 'inventory', 'owner');

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(120) NOT NULL,
    login_id            VARCHAR(12) UNIQUE NOT NULL,          -- wireframe: 6-12 chars, distinct from email
    email               VARCHAR(160) UNIQUE NOT NULL,
    password_hash       TEXT NOT NULL,
    role                role_enum,                             -- NULL allowed only if is_system_admin = true
    is_system_admin     BOOLEAN NOT NULL DEFAULT false,         -- routes to System Administrator Dashboard on login; bypasses role_permissions
    address             VARCHAR(250),
    mobile_number       VARCHAR(20),
    position            VARCHAR(80),                           -- read-only, settable only by system admin (app-layer rule)
    photo_url           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_login_id_length CHECK (char_length(login_id) BETWEEN 6 AND 12),
    CONSTRAINT chk_role_or_admin CHECK (is_system_admin = true OR role IS NOT NULL)
);

-- ----------------------------
-- VENDORS & CUSTOMERS
-- ----------------------------
CREATE TABLE vendors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(160) NOT NULL,
    address         VARCHAR(250),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(160) NOT NULL,
    address         VARCHAR(250),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------
-- PRODUCT  (finished good | sub-assembly | raw component — same table)
-- ----------------------------
CREATE TYPE product_type_enum AS ENUM ('finished_good', 'sub_assembly', 'raw_component');
CREATE TYPE procurement_type_enum AS ENUM ('purchase', 'manufacturing');

CREATE TABLE products (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(160) NOT NULL,
    product_type        product_type_enum NOT NULL DEFAULT 'finished_good',

    sales_price         NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost_price          NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- on_hand_qty is the ONLY physically-true stock number.
    -- it only ever changes on: PO fully/partially received,
    -- MO produced (finished good +), MO consumed (component -),
    -- SO delivered (-). Never written directly from the UI —
    -- every change MUST also insert a stock_ledger row (below).
    on_hand_qty         NUMERIC(14,3) NOT NULL DEFAULT 0,

    -- reserved_qty is COMPUTED, never stored as a free-typed field.
    -- formula lives in v_product_stock view (spec's literal wording:
    -- reserved = SUM(delivered_qty) on not-yet-fully-delivered SOs
    -- + SUM(consumed_qty) on not-yet-Done MOs where this product
    -- is a component).
    reserved_qty        NUMERIC(14,3) NOT NULL DEFAULT 0,  -- materialized cache only, refresh via app/trigger

    procure_on_demand   BOOLEAN NOT NULL DEFAULT false,
    procurement_type     procurement_type_enum,            -- required if procure_on_demand
    vendor_id            UUID REFERENCES vendors(id),       -- required if procurement_type = purchase
    default_bom_id        UUID,                             -- required if procurement_type = manufacturing (FK added after boms table exists)

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_procure_fields CHECK (
        (procure_on_demand = false)
        OR (procure_on_demand = true AND procurement_type IS NOT NULL)
    )
);

CREATE INDEX idx_products_type ON products(product_type);

-- ----------------------------
-- BILL OF MATERIALS (recursive: a BOM_LINE component can itself
-- be a product with its own default_bom_id -> multi-level)
-- ----------------------------
CREATE TABLE boms (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference           VARCHAR(40) UNIQUE NOT NULL,        -- BOM-000001
    finished_product_id UUID NOT NULL REFERENCES products(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products
    ADD CONSTRAINT fk_products_default_bom
    FOREIGN KEY (default_bom_id) REFERENCES boms(id);

CREATE TABLE bom_lines (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bom_id                  UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
    component_product_id   UUID NOT NULL REFERENCES products(id),
    qty_per_unit            NUMERIC(14,3) NOT NULL CHECK (qty_per_unit > 0)
    -- a product cannot be its own (recursive) component — guarded in app layer,
    -- since checking this in SQL requires a recursive CTE on every insert
);

CREATE TABLE bom_operations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bom_id                  UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
    sequence                INT NOT NULL,
    operation_name          VARCHAR(120) NOT NULL,
    work_center             VARCHAR(120) NOT NULL,
    expected_duration_min   INT NOT NULL CHECK (expected_duration_min >= 0)  -- duration FOR QTY=1; MO scales linearly
);

-- ----------------------------
-- SALES ORDER
-- ----------------------------
CREATE TYPE so_status_enum AS ENUM ('draft', 'confirmed', 'partially_delivered', 'fully_delivered', 'cancelled');

CREATE TABLE sales_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference       VARCHAR(40) UNIQUE NOT NULL,        -- SO-000001
    customer_id     UUID NOT NULL REFERENCES customers(id),
    customer_address VARCHAR(250),                      -- snapshot at order-create time, frozen on confirm
    salesperson_id  UUID REFERENCES users(id),
    status          so_status_enum NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id)
);

CREATE TABLE sales_order_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_order_id  UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    ordered_qty     NUMERIC(14,3) NOT NULL CHECK (ordered_qty > 0),
    delivered_qty   NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0),
    sales_price     NUMERIC(14,2) NOT NULL,              -- snapshot at line-add time (track logs on change)

    CONSTRAINT chk_delivered_not_over CHECK (delivered_qty <= ordered_qty)
);

-- line_total is NOT a stored/generated column — per the literal wireframe
-- text it's "Ordered Qty * Sales Price (once delivered it should be
-- Delivered Qty * Sales Price)" — i.e. the FORMULA ITSELF depends on the
-- parent order's status, which a GENERATED column can't read (no cross-
-- table reference). So this is a view, computed fresh every read:
CREATE OR REPLACE VIEW v_sales_order_line_totals AS
SELECT
    sol.id AS sales_order_line_id,
    sol.sales_order_id,
    sol.product_id,
    sol.ordered_qty,
    sol.delivered_qty,
    sol.sales_price,
    CASE
        WHEN so.status IN ('draft', 'confirmed') THEN sol.ordered_qty * sol.sales_price
        ELSE sol.delivered_qty * sol.sales_price  -- partially_delivered / fully_delivered: spec's "once delivered" switch
    END AS line_total
FROM sales_order_lines sol
JOIN sales_orders so ON so.id = sol.sales_order_id;

CREATE OR REPLACE VIEW v_sales_order_totals AS
SELECT sales_order_id, SUM(line_total) AS total_amount
FROM v_sales_order_line_totals
GROUP BY sales_order_id;

-- ----------------------------
-- PURCHASE ORDER
-- ----------------------------
CREATE TYPE po_status_enum AS ENUM ('draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled');

CREATE TABLE purchase_orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference           VARCHAR(40) UNIQUE NOT NULL,      -- PO-000001
    vendor_id            UUID NOT NULL REFERENCES vendors(id),
    vendor_address       VARCHAR(250),
    responsible_person_id UUID REFERENCES users(id),
    status               po_status_enum NOT NULL DEFAULT 'draft',
    auto_created         BOOLEAN NOT NULL DEFAULT false,   -- true if spawned by shortage trigger
    source_sales_order_id UUID REFERENCES sales_orders(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by           UUID REFERENCES users(id)
);

CREATE TABLE purchase_order_lines (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id),
    ordered_qty          NUMERIC(14,3) NOT NULL CHECK (ordered_qty > 0),
    received_qty         NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
    cost_price            NUMERIC(14,2) NOT NULL,
    batch_number          VARCHAR(60),                     -- for recall management (DriveForge stretch feature)

    CONSTRAINT chk_received_not_over CHECK (received_qty <= ordered_qty)
);

-- same reasoning as v_sales_order_line_totals: "Total = Ordered Qty *
-- Cost Price (once received it should be Received Qty * Cost Price)"
-- is status-dependent, so it's a view, not a generated column.
CREATE OR REPLACE VIEW v_purchase_order_line_totals AS
SELECT
    pol.id AS purchase_order_line_id,
    pol.purchase_order_id,
    pol.product_id,
    pol.ordered_qty,
    pol.received_qty,
    pol.cost_price,
    CASE
        WHEN po.status IN ('draft', 'confirmed') THEN pol.ordered_qty * pol.cost_price
        ELSE pol.received_qty * pol.cost_price  -- partially_received / fully_received
    END AS line_total
FROM purchase_order_lines pol
JOIN purchase_orders po ON po.id = pol.purchase_order_id;

CREATE OR REPLACE VIEW v_purchase_order_totals AS
SELECT purchase_order_id, SUM(line_total) AS total_amount
FROM v_purchase_order_line_totals
GROUP BY purchase_order_id;

-- ----------------------------
-- MANUFACTURING ORDER  (recursive: an MO for a finished good can
-- spawn child MOs for sub-assembly shortages)
-- ----------------------------
CREATE TYPE mo_status_enum AS ENUM ('draft', 'confirmed', 'in_progress', 'to_close', 'done', 'cancelled');

CREATE TABLE manufacturing_orders (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference                VARCHAR(40) UNIQUE NOT NULL,   -- MO-000001
    finished_product_id      UUID NOT NULL REFERENCES products(id),
    bom_id                    UUID REFERENCES boms(id),      -- nullable: manual components allowed if no BoM
    quantity                  NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    assignee_id                UUID REFERENCES users(id),
    status                     mo_status_enum NOT NULL DEFAULT 'draft',

    auto_created               BOOLEAN NOT NULL DEFAULT false,
    source_sales_order_id       UUID REFERENCES sales_orders(id),
    parent_mo_id                 UUID REFERENCES manufacturing_orders(id),  -- set when spawned by a PARENT MO's sub-assembly shortage

    vin_number                   VARCHAR(40) UNIQUE,          -- DriveForge stretch feature, null for non-vehicle products
    scheduled_date                DATE,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                    UUID REFERENCES users(id)
);

CREATE TABLE mo_components (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mo_id               UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
    component_product_id UUID NOT NULL REFERENCES products(id),
    to_consume           NUMERIC(14,3) NOT NULL,   -- from BOM if present (manually entered if bom_id is null)
    consumed_qty          NUMERIC(14,3) NOT NULL DEFAULT 0,  -- manually entered by Manufacturing user, per spec
    batch_number           VARCHAR(60)             -- which incoming PO batch this component came from (recall traceability)
);

CREATE TABLE work_orders (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mo_id                   UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
    sequence                INT NOT NULL,
    operation_name           VARCHAR(120) NOT NULL,
    work_center               VARCHAR(120) NOT NULL,
    expected_duration_min     INT NOT NULL,   -- = bom_operations.expected_duration_min * mo.quantity
    real_duration_min          INT,
    pass_fail                  VARCHAR(10)    -- 'pass' | 'fail' | null — DriveForge Road Test stretch feature
);

-- ============================================================
-- STOCK LEDGER  (the genuinely missing piece — every movement
-- against on_hand_qty must insert exactly one row here, in the
-- SAME transaction as the on_hand_qty update. This is what
-- "Stock Ledger tracks every inventory movement" in the brief
-- actually means — a journal, not just the resulting number.)
-- ============================================================
CREATE TYPE ledger_movement_enum AS ENUM (
    'po_receipt',        -- + on PO line received
    'so_delivery',       -- - on SO line delivered
    'mo_produce',        -- + finished good on MO done
    'mo_consume',        -- - component on MO done
    'manual_adjustment'  -- rare, audited separately
);

CREATE TABLE stock_ledger (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id),
    movement_type   ledger_movement_enum NOT NULL,
    qty_change      NUMERIC(14,3) NOT NULL,         -- signed: + or -
    qty_before      NUMERIC(14,3) NOT NULL,
    qty_after       NUMERIC(14,3) NOT NULL,
    reference_type  VARCHAR(40) NOT NULL,           -- 'SalesOrder' | 'PurchaseOrder' | 'ManufacturingOrder'
    reference_id    UUID NOT NULL,                  -- the SO/PO/MO id that caused this movement
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id),

    CONSTRAINT chk_qty_math CHECK (qty_after = qty_before + qty_change)
);

CREATE INDEX idx_ledger_product_time ON stock_ledger(product_id, occurred_at DESC);
CREATE INDEX idx_ledger_reference ON stock_ledger(reference_type, reference_id);

-- ----------------------------
-- AUDIT LOGS  (log on save + status transitions only, never per-keystroke)
-- ----------------------------
CREATE TYPE audit_action_enum AS ENUM ('created', 'updated', 'deleted', 'status_changed');

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         UUID REFERENCES users(id),
    module          VARCHAR(40) NOT NULL,        -- 'Sales' | 'Purchase' | 'Manufacturing' | 'BoM' | 'Product'
    record_type     VARCHAR(60) NOT NULL,
    record_id       UUID NOT NULL,
    action          audit_action_enum NOT NULL,
    field_changed   VARCHAR(80),
    old_value       TEXT,
    new_value       TEXT
);

CREATE INDEX idx_audit_module_time ON audit_logs(module, occurred_at DESC);
CREATE INDEX idx_audit_record ON audit_logs(record_type, record_id);

-- ----------------------------
-- ROLE PERMISSIONS  (module x action x role -> allowed)
-- Kept role-based, not per-user: the wireframe's permission grid
-- is explicitly Admin/User/None columns, not a per-employee matrix.
-- ----------------------------
CREATE TABLE role_permissions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role        role_enum NOT NULL,
    module      VARCHAR(40) NOT NULL,     -- 'Sales' | 'Purchase' | 'Manufacturing' | 'Product' | 'BoM' | 'AuditLog'
    action      VARCHAR(40) NOT NULL,     -- 'view' | 'create' | 'edit' | 'delete' | 'approve'
    allowed     BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(role, module, action)
);

-- ============================================================
-- COMPUTED STOCK VIEW
-- reserved_qty per spec's LITERAL formula (verified against the
-- wireframe source text directly — not a paraphrase):
--   reserved = SUM(delivered_qty) on SO lines where SO is
--              confirmed/partially_delivered (not yet fully delivered)
--            + SUM(consumed_qty) on MO components where MO is
--              confirmed/in_progress/to_close (not yet done/cancelled)
-- free_to_use = on_hand_qty - reserved_qty
--
-- Why this isn't double-counting (it looks like it would at first glance):
-- on_hand_qty is INTENTIONALLY a lagging number — per the wireframe's
-- own Product field rules, it only changes at the TERMINAL status of
-- each order type (PO -> Fully Received, SO -> Fully Delivered,
-- MO -> Done), never incrementally on a partial event. So during a
-- partial delivery, on_hand_qty has NOT moved yet — reserved_qty
-- (= delivered_qty so far) is exactly what's covering that gap so
-- free_to_use stays accurate for new orders in the meantime. The two
-- numbers are designed to be read together, not independently.
-- This means the app-layer stock_ledger write for SO delivery must
-- ONLY fire when status transitions to fully_delivered (writing the
-- order's full ordered_qty as the movement), not on every partial
-- delivery click — same for PO -> fully_received and MO -> done.
-- See the build prompts for exactly where this fires.
-- ============================================================
CREATE OR REPLACE VIEW v_product_stock AS
SELECT
    p.id AS product_id,
    p.name,
    p.on_hand_qty,
    COALESCE(so_reserved.qty, 0) + COALESCE(mo_reserved.qty, 0) AS reserved_qty,
    p.on_hand_qty - (COALESCE(so_reserved.qty, 0) + COALESCE(mo_reserved.qty, 0)) AS free_to_use_qty
FROM products p
LEFT JOIN (
    SELECT sol.product_id, SUM(sol.delivered_qty) AS qty
    FROM sales_order_lines sol
    JOIN sales_orders so ON so.id = sol.sales_order_id
    WHERE so.status IN ('confirmed', 'partially_delivered')
    GROUP BY sol.product_id
) so_reserved ON so_reserved.product_id = p.id
LEFT JOIN (
    SELECT mc.component_product_id AS product_id, SUM(mc.consumed_qty) AS qty
    FROM mo_components mc
    JOIN manufacturing_orders mo ON mo.id = mc.mo_id
    WHERE mo.status IN ('confirmed', 'in_progress', 'to_close')
    GROUP BY mc.component_product_id
) mo_reserved ON mo_reserved.product_id = p.id;

-- ============================================================
-- RECALL MANAGEMENT QUERY (DriveForge stretch feature)
-- "find every MO that consumed a given defective batch"
-- ============================================================
CREATE OR REPLACE VIEW v_recall_lookup AS
SELECT
    mo.id AS mo_id,
    mo.reference AS mo_reference,
    mo.vin_number,
    mc.batch_number,
    pr.name AS component_name,
    mc.consumed_qty
FROM mo_components mc
JOIN manufacturing_orders mo ON mo.id = mc.mo_id
JOIN products pr ON pr.id = mc.component_product_id
WHERE mc.batch_number IS NOT NULL;
