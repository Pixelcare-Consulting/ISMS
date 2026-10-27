-- Customer-tenant Super Admin keeps setup permissions only.
-- Platform-tenant Super Admin is unchanged.

DELETE FROM "role_permissions"
WHERE "role_id" IN (
  SELECT r."id"
  FROM "roles" AS r
  INNER JOIN "tenants" AS t ON t."id" = r."tenant_id"
  WHERE r."slug" = 'super_admin'
    AND t."is_platform" = false
);

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" AS r
INNER JOIN "tenants" AS t ON t."id" = r."tenant_id"
INNER JOIN "permissions" AS p ON p."slug" IN (
  'company.view',
  'company.manage',
  'departments.manage',
  'status_settings.manage',
  'users.manage',
  'roles.manage',
  'aors.view',
  'aors.manage',
  'branches.view',
  'branches.manage',
  'warehouses.manage',
  'service_centers.manage',
  'dealers.manage',
  'ordering_settings.view',
  'ordering_settings.manage',
  'planogram.view',
  'planogram.manage',
  'master_data.manage'
)
WHERE r."slug" = 'super_admin'
  AND t."is_platform" = false;
