-- The six Monthly SIR action permissions lived only in scripts/grant-monthly-sir-actions.ts,
-- so a database that never ran it (staging on ismsv2, any new environment) has no catalog
-- rows for them and nobody can see or tick them. This applies the script's rules in SQL.
-- On a database where the script already ran it inserts nothing.
--
-- Pull-out grants (scripts/grant-pullout-actions.ts) are deliberately not here: their
-- catalog rows already come from 20261124100000_permission_catalog_backfill, and clients
-- have been ticking and unticking them by hand since, so the old fallback rules would
-- undo those choices.
--
-- Rows only: nothing is removed or changed. Safe to rerun.
-- Keep in sync with src/features/monthly-sir/constants/monthly-sir-permissions.ts and
-- scripts/monthly-sir-actions-grant.ts.

-- 1. Catalog rows (MONTHLY_SIR_PERMISSION_CATALOG without View, which already exists).
INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'inventory.monthly_sir.download_template', 'Download Monthly SIR template', NOW(), NOW()),
  (gen_random_uuid()::text, 'inventory.monthly_sir.scan_serials', 'Scan Monthly SIR serials', NOW(), NOW()),
  (gen_random_uuid()::text, 'inventory.monthly_sir.upload', 'Upload Monthly SIR P-COUNT', NOW(), NOW()),
  (gen_random_uuid()::text, 'inventory.monthly_sir.generate_variance', 'Generate Monthly SIR variance', NOW(), NOW()),
  (gen_random_uuid()::text, 'inventory.monthly_sir.open_pcount', 'Open Monthly SIR P-Count', NOW(), NOW()),
  (gen_random_uuid()::text, 'inventory.monthly_sir.approve', 'Approve Monthly SIR', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

-- 2. Monthly SIR use actions: every role that already has Monthly SIR View.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" AS r
INNER JOIN "role_permissions" AS view_grant ON view_grant."role_id" = r."id"
INNER JOIN "permissions" AS view_perm
  ON view_perm."id" = view_grant."permission_id"
  AND view_perm."slug" = 'inventory.monthly_sir.view'
CROSS JOIN "permissions" AS p
WHERE r."deleted_at" IS NULL
  AND p."slug" IN (
    'inventory.monthly_sir.download_template',
    'inventory.monthly_sir.scan_serials',
    'inventory.monthly_sir.upload',
    'inventory.monthly_sir.generate_variance',
    'inventory.monthly_sir.open_pcount'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 3. Monthly SIR Approve: roles that have both Monthly SIR View and Branch inventory Manage.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE r."deleted_at" IS NULL
  AND p."slug" = 'inventory.monthly_sir.approve'
  AND EXISTS (
    SELECT 1
    FROM "role_permissions" AS rp
    INNER JOIN "permissions" AS held ON held."id" = rp."permission_id"
    WHERE rp."role_id" = r."id" AND held."slug" = 'inventory.monthly_sir.view'
  )
  AND EXISTS (
    SELECT 1
    FROM "role_permissions" AS rp
    INNER JOIN "permissions" AS held ON held."id" = rp."permission_id"
    WHERE rp."role_id" = r."id" AND held."slug" = 'inventory.manage'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 4. Customer-tenant Super Admin holds every catalog permission (as in the catalog backfill).
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" AS r
INNER JOIN "tenants" AS t ON t."id" = r."tenant_id"
CROSS JOIN "permissions" AS p
WHERE r."slug" = 'super_admin'
  AND r."deleted_at" IS NULL
  AND t."is_platform" = false
  AND p."slug" IN (
    'inventory.monthly_sir.download_template',
    'inventory.monthly_sir.scan_serials',
    'inventory.monthly_sir.upload',
    'inventory.monthly_sir.generate_variance',
    'inventory.monthly_sir.open_pcount',
    'inventory.monthly_sir.approve'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
