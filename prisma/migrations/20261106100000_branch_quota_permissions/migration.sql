-- Branch quotas get their own view and manage permissions, split from branches.*.
-- Every role that manages branches today keeps the same quota access.

INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'branch_quotas.view', 'View branch quotas', NOW(), NOW()),
  (gen_random_uuid()::text, 'branch_quotas.manage', 'Manage branch quotas', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, granted."role_id", quota."id", NOW()
FROM "role_permissions" AS granted
INNER JOIN "permissions" AS branches_manage
  ON branches_manage."id" = granted."permission_id"
  AND branches_manage."slug" = 'branches.manage'
CROSS JOIN "permissions" AS quota
WHERE quota."slug" IN ('branch_quotas.view', 'branch_quotas.manage')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
