-- Service center orders are approved by Supply Planning, like branch orders.
-- Grants the approve permission to the Supply Planning roles. Team Leaders keep it
-- because SC pull-out approval still uses it; the SC order screens gate on role.

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, role."id", approve."id", NOW()
FROM "roles" AS role
CROSS JOIN "permissions" AS approve
WHERE approve."slug" = 'service_centers.orders.approve'
  AND role."deleted_at" IS NULL
  AND role."slug" IN ('sp', 'spa', 'supply_planning', 'supply_planning_associate')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
