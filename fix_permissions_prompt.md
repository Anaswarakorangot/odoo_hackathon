Fix three issues in the auth/permissions code before we move on:

1. SECURITY: Check app/api/routes/auth.py's signup endpoint. If it writes `role` or
   `is_system_admin` directly from the client-supplied SignupRequest body, fix this now —
   signup must hardcode is_system_admin=False server-side and ignore whatever the client sends
   for that field, regardless of what's in the request schema. Per the wireframe, there is no
   signup flow under "Login as System Administrator" at all — only regular System Users can
   self-register. If you want to keep `role` as a client-supplied field on signup that's fine
   (a new user picking their own department is reasonable), but is_system_admin must never be
   settable by the person signing up. System Administrators must only ever be created by an
   existing System Administrator (via a future admin-only user-creation endpoint), never via
   public signup.

2. Fix app/db/seed_permissions.py to match this literal table (re-verified directly from the
   wireframe, Admin/User/None columns):

   | Module        | Action            | Admin | User    |
   |---------------|-------------------|-------|---------|
   | Sales         | View              | True  | True    |
   | Sales         | Create            | True  | True    |
   | Sales         | Edit              | True  | True    |
   | Sales         | Delete            | True  | False   |
   | Sales         | Approve           | True  | False   |
   | Purchase      | View              | True  | True    |
   | Purchase      | Create            | True  | True    |
   | Purchase      | Edit              | True  | True    |
   | Purchase      | Approve           | True  | False   |
   | Manufacturing | View              | True  | True    |
   | Manufacturing | Production Entry  | True  | True    |
   | Manufacturing | Edit BOM          | True  | False   |
   | Product       | View              | True  | True    |
   | Product       | Create            | True  | True    |
   | Product       | Edit              | True  | True    |

   Specific changes from what's there now:
   - Remove `delete` from the `sales` role's Sales permissions (currently granted, should be
     False — only Admin deletes).
   - Add a new `approve` action, seeded False for every non-admin role on both Sales and
     Purchase. This is the action that will gate the Sales Order / Purchase Order Confirm
     button later — per spec, only an Admin (is_system_admin=True, which bypasses
     role_permissions entirely) can confirm an order, not the sales/purchase user who created
     it. Note this in a code comment since it's counter-intuitive and easy for a teammate to
     "fix" by accident later.
   - Give the `owner` role explicit `create` and `edit` True on Product specifically (everything
     else for owner stays view-only) — the spec describes Business Owner as someone who
     "manages product," not just views it.
   - manufacturing role keeps `production_entry`=True, `edit_bom`=False — this part was already
     correct, don't change it.

3. Add a quick test (or just manually verify and tell me the result) that a `require_permission`
   check for an action with NO row in role_permissions returns deny, not allow — i.e. confirm the
   "fail closed" behavior, not "fail open." This matters because the new `approve` action you're
   adding only works correctly if missing/False rows are treated as denied.

After making these changes, re-run the idempotent seed (or confirm it only inserts missing rows
without duplicating) and show me the resulting role_permissions table contents for the `sales`
and `purchase` roles specifically, so I can check it against the table above directly.
