-- Branch transfers View: opens Transfers read only (client request: Accounting views
-- transfers without acting on them). Create, Approve, and Receive keep their own checkboxes.
--
-- Rows only: nothing is removed or changed. Safe to rerun.

INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'logistics.delivery_transfer.view', 'View branch transfers', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" AS r
INNER JOIN "permissions" AS p ON p."slug" = 'logistics.delivery_transfer.view'
WHERE r."slug" IN ('accounting', 'super_admin')
  AND r."deleted_at" IS NULL
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
