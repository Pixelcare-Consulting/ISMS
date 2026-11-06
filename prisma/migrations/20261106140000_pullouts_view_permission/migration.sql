-- Pull-outs get their own view permission, split from the shared logistics page gate.
-- Every role that can open the module today keeps that access.

INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'pullouts.view', 'View pull-outs', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, granted."role_id", pullouts_view."id", NOW()
FROM (
  SELECT DISTINCT existing."role_id"
  FROM "role_permissions" AS existing
  INNER JOIN "permissions" AS gate
    ON gate."id" = existing."permission_id"
    AND gate."slug" IN (
      'logistics.view',
      'logistics.create',
      'logistics.manage',
      'logistics.delivery.receive',
      'orders.create',
      'orders.view'
    )
) AS granted
CROSS JOIN "permissions" AS pullouts_view
WHERE pullouts_view."slug" = 'pullouts.view'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
