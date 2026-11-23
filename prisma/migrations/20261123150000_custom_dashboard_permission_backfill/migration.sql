-- dashboard.custom.view and dashboard.custom.manage lived only in prisma/seed-data.ts.
-- 20261023180000 granted them to customer-tenant Super Admin by joining those rows.
-- On a database that was never re-seeded, the join matched nothing, the migration
-- was recorded as applied, and the sidebar kept hiding Custom Dashboards.
-- Insert the catalog rows, then grant the same two slugs to customer-tenant Super Admin only.

INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'dashboard.custom.view', 'View custom dashboards', NOW(), NOW()),
  (gen_random_uuid()::text, 'dashboard.custom.manage', 'Build custom dashboards', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" AS r
INNER JOIN "tenants" AS t ON t."id" = r."tenant_id"
INNER JOIN "permissions" AS p ON p."slug" IN (
  'dashboard.custom.view',
  'dashboard.custom.manage'
)
WHERE r."slug" = 'super_admin'
  AND t."is_platform" = false
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
