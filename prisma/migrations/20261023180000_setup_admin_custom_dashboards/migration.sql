-- Customer-tenant Super Admin can open and design custom dashboards.
-- Platform-tenant Super Admin is unchanged.

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
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permissions" AS existing
    WHERE existing."role_id" = r."id"
      AND existing."permission_id" = p."id"
  );
