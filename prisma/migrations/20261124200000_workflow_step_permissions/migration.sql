-- Workflow steps as checkboxes (docs/permissions-flexibility-plan.md, part 2).
--
-- Rules that checked a role slug (tl, sp, spa, supply_planning, supply_planning_associate,
-- ps, tenant_admin, super_admin) now check a permission of their own. This adds those
-- catalog rows and ticks them on existing roles by slug, so every role keeps what it could
-- do the day before. After this, Settings -> Roles alone decides; renaming a role or adding
-- a new one never changes who acts at a step.
--
-- Rows only: nothing is removed or changed. Safe to rerun.
-- Keep in sync with src/features/roles/constants/workflow-step-permissions.ts.

-- 1. Catalog rows.
INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'orders.manual.approve_sp', 'Supply Planning approval (manual orders)', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.manual.edit_pending', 'Edit manual orders while Pending SP', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.manual.view_all', 'See everyone''s manual orders', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.manual.view_queue', 'See every pending step (manual orders)', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.manual.force_cancel', 'Cancel any pending manual order', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.special.approve_sp', 'Supply Planning approval (special orders)', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.special.view_all', 'See everyone''s special orders', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.special.view_queue', 'See every pending step (special orders)', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.special.force_cancel', 'Cancel any pending special order', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.auto_replenish.approve_tl', 'Team Leader review (auto replenish)', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.auto_replenish.approve_sp', 'Supply Planning approval (auto replenish)', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.auto_replenish.view_queue', 'See every pending step (auto replenish)', NOW(), NOW()),
  (gen_random_uuid()::text, 'orders.auto_replenish.force_cancel', 'Cancel any pending auto-replenish order', NOW(), NOW()),
  (gen_random_uuid()::text, 'service_centers.orders.approve_sp', 'Supply Planning approval (service center orders)', NOW(), NOW()),
  (gen_random_uuid()::text, 'inventory.defect.approve', 'Approve defect reports', NOW(), NOW()),
  (gen_random_uuid()::text, 'inventory.monthly_sir.upload_scheduled', 'Upload P-COUNT on scheduled days', NOW(), NOW()),
  (gen_random_uuid()::text, 'inventory.monthly_sir.upload_slots', 'Upload P-COUNT with free slots', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

-- 2. Grants by the slug that used to decide each rule.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM (
  VALUES
    -- Supply Planning step (final order approval, SP remarks, cancel approved, SC orders).
    ('sp', 'orders.manual.approve_sp'),
    ('sp', 'orders.special.approve_sp'),
    ('sp', 'orders.auto_replenish.approve_sp'),
    ('sp', 'service_centers.orders.approve_sp'),
    ('spa', 'orders.manual.approve_sp'),
    ('spa', 'orders.special.approve_sp'),
    ('spa', 'orders.auto_replenish.approve_sp'),
    ('spa', 'service_centers.orders.approve_sp'),
    ('supply_planning', 'orders.manual.approve_sp'),
    ('supply_planning', 'orders.special.approve_sp'),
    ('supply_planning', 'orders.auto_replenish.approve_sp'),
    ('supply_planning', 'service_centers.orders.approve_sp'),
    ('supply_planning_associate', 'orders.manual.approve_sp'),
    ('supply_planning_associate', 'orders.special.approve_sp'),
    ('supply_planning_associate', 'orders.auto_replenish.approve_sp'),
    ('supply_planning_associate', 'service_centers.orders.approve_sp'),
    ('super_admin', 'service_centers.orders.approve_sp'),
    -- Team Leader review on auto replenish.
    ('tl', 'orders.auto_replenish.approve_tl'),
    -- Edit manual orders while Pending SP.
    ('ps', 'orders.manual.edit_pending'),
    ('tl', 'orders.manual.edit_pending'),
    -- Full live order queue.
    ('tenant_admin', 'orders.manual.view_queue'),
    ('tenant_admin', 'orders.special.view_queue'),
    ('tenant_admin', 'orders.auto_replenish.view_queue'),
    ('super_admin', 'orders.manual.view_queue'),
    ('super_admin', 'orders.special.view_queue'),
    ('super_admin', 'orders.auto_replenish.view_queue'),
    -- Bulk cancel / discard on the Orders list.
    ('super_admin', 'orders.manual.force_cancel'),
    ('super_admin', 'orders.special.force_cancel'),
    ('super_admin', 'orders.auto_replenish.force_cancel'),
    -- Transfer and defect approval for AOR branches (Super Admin: all branches through
    -- Manage branches). Team Leaders approved transfers through orders.approve before.
    ('tl', 'logistics.delivery_transfer.approve'),
    ('super_admin', 'logistics.delivery_transfer.approve'),
    ('tl', 'inventory.defect.approve'),
    ('super_admin', 'inventory.defect.approve'),
    -- P-COUNT upload budget.
    ('ps', 'inventory.monthly_sir.upload_scheduled'),
    ('tl', 'inventory.monthly_sir.upload_slots')
) AS grant_row ("role_slug", "permission_slug")
INNER JOIN "roles" AS r ON r."slug" = grant_row."role_slug" AND r."deleted_at" IS NULL
INNER JOIN "permissions" AS p ON p."slug" = grant_row."permission_slug"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 3. "See everyone's orders": every role except ps that could open that order type
-- (the creator limit applied only to the ps slug).
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT DISTINCT ON (r."id", p."id") gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" AS r
INNER JOIN "role_permissions" AS existing ON existing."role_id" = r."id"
INNER JOIN "permissions" AS held ON held."id" = existing."permission_id"
INNER JOIN (
  VALUES ('orders.manual', 'orders.manual.view_all'), ('orders.special', 'orders.special.view_all')
) AS scope_row ("prefix", "permission_slug")
  ON held."slug" IN (
    scope_row."prefix" || '.view',
    scope_row."prefix" || '.create',
    scope_row."prefix" || '.approve',
    'orders.view',
    'orders.create',
    'orders.approve'
  )
INNER JOIN "permissions" AS p ON p."slug" = scope_row."permission_slug"
WHERE r."deleted_at" IS NULL
  AND r."slug" <> 'ps'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
