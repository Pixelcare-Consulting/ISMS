-- Inventory Approvals: one row per unit per approval step, for read-only traceability.
-- Rows start from this release. Earlier decisions stay in the Serial Number Logs, and a
-- document already in progress gets its row when the next decision on it lands.

CREATE TYPE "InventoryApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TYPE "InventoryApprovalSource" AS ENUM (
  'DEFECT_REPORT',
  'TRANSFER',
  'PULLOUT',
  'SALES_RETURN',
  'DELIVERY_RETURN',
  'DELIVERY_TRANSFER',
  'SC_PULLOUT',
  'SC_RETURN'
);

CREATE TYPE "InventoryApprovalStep" AS ENUM (
  'INSPECTION',
  'CS_EVALUATION',
  'TL_APPROVAL',
  'APPROVAL',
  'RECEIVING'
);

CREATE TABLE "inventory_approvals" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "serial_number_id" TEXT NOT NULL,
  "source_type" "InventoryApprovalSource" NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_no" TEXT,
  "step" "InventoryApprovalStep" NOT NULL,
  "status" "InventoryApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requested_by_id" TEXT,
  "decided_by_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "remarks" TEXT,
  "problem_description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "inventory_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_approvals_document_unit_key"
  ON "inventory_approvals"("tenant_id", "source_type", "source_id", "step", "serial_number_id");
CREATE INDEX "inventory_approvals_tenant_id_updated_at_idx"
  ON "inventory_approvals"("tenant_id", "updated_at");
CREATE INDEX "inventory_approvals_tenant_id_status_updated_at_idx"
  ON "inventory_approvals"("tenant_id", "status", "updated_at");
CREATE INDEX "inventory_approvals_serial_number_id_idx"
  ON "inventory_approvals"("serial_number_id");
CREATE INDEX "inventory_approvals_requested_by_id_idx"
  ON "inventory_approvals"("requested_by_id");
CREATE INDEX "inventory_approvals_decided_by_id_idx"
  ON "inventory_approvals"("decided_by_id");

ALTER TABLE "inventory_approvals"
  ADD CONSTRAINT "inventory_approvals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_approvals"
  ADD CONSTRAINT "inventory_approvals_serial_number_id_fkey"
  FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_approvals"
  ADD CONSTRAINT "inventory_approvals_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_approvals"
  ADD CONSTRAINT "inventory_approvals_decided_by_id_fkey"
  FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Traceability is for administrators: Super Admin and Tenant Admin only.
INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'inventory_approvals.view', 'View inventory approvals', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, admin_role."id", approvals_view."id", NOW()
FROM "roles" AS admin_role
CROSS JOIN "permissions" AS approvals_view
WHERE admin_role."slug" IN ('super_admin', 'tenant_admin')
  AND approvals_view."slug" = 'inventory_approvals.view'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
