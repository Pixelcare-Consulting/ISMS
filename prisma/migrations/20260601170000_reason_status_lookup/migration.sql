-- Reason/Status lookup tables (ISMS-v2 schema) + migrate logistics/inventory FKs

-- CreateEnum
CREATE TYPE "ReasonStatusCategory" AS ENUM (
  'inventory_system',
  'pullout_reason',
  'delivery_workflow',
  'transfer_workflow',
  'pullout_workflow'
);

-- CreateEnum
CREATE TYPE "LookupRecordStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "reason_statuses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category" "ReasonStatusCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reason_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reason_status_codes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reason_status_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reason_status_codes_pkey" PRIMARY KEY ("id")
);

-- Add nullable FK columns before backfill
ALTER TABLE "branch_inventories" ADD COLUMN "status_code_id" TEXT;
ALTER TABLE "branch_deliveries" ADD COLUMN "status_code_id" TEXT;
ALTER TABLE "branch_transfers" ADD COLUMN "status_code_id" TEXT;
ALTER TABLE "branch_pullouts" ADD COLUMN "status_code_id" TEXT;
ALTER TABLE "branch_pullouts" ADD COLUMN "reason_status_id" TEXT;
ALTER TABLE "branch_pullouts" ADD COLUMN "reason_status_code_id" TEXT;

-- Seed default groups/codes per tenant and backfill FKs
DO $$
DECLARE
  t RECORD;
  rs_inv TEXT; rs_por TEXT; rs_del TEXT; rs_xfr TEXT; rs_plt TEXT;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    -- inventory_system
    INSERT INTO reason_statuses (id, tenant_id, category, name, code, updated_at)
    VALUES (gen_random_uuid()::text, t.id, 'inventory_system', 'Inventory system status', 'inventory_system', NOW());
    SELECT id INTO rs_inv FROM reason_statuses WHERE tenant_id = t.id AND category = 'inventory_system' LIMIT 1;

    INSERT INTO reason_status_codes (id, tenant_id, reason_status_id, name, code, sort_order, is_system, updated_at) VALUES
      (gen_random_uuid()::text, t.id, rs_inv, 'Delivery in transit', 'DIT', 1, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_inv, 'Stock', 'STK', 2, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_inv, 'Sold', 'SLD', 3, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_inv, 'Reserved', 'RSV', 4, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_inv, 'Defective', 'DEF', 5, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_inv, 'For pull-out', 'FPO', 6, true, NOW());

    -- pullout_reason
    INSERT INTO reason_statuses (id, tenant_id, category, name, code, updated_at)
    VALUES (gen_random_uuid()::text, t.id, 'pullout_reason', 'Pull-out reason', 'pullout_reason', NOW());
    SELECT id INTO rs_por FROM reason_statuses WHERE tenant_id = t.id AND category = 'pullout_reason' LIMIT 1;

    INSERT INTO reason_status_codes (id, tenant_id, reason_status_id, name, code, sort_order, is_system, updated_at) VALUES
      (gen_random_uuid()::text, t.id, rs_por, 'Defective units', 'DEF', 1, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_por, 'Overstock', 'OVR', 2, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_por, 'Model discontinuation', 'MDL', 3, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_por, 'Other', 'OTH', 4, true, NOW());

    -- delivery_workflow
    INSERT INTO reason_statuses (id, tenant_id, category, name, code, updated_at)
    VALUES (gen_random_uuid()::text, t.id, 'delivery_workflow', 'Delivery workflow', 'delivery_workflow', NOW());
    SELECT id INTO rs_del FROM reason_statuses WHERE tenant_id = t.id AND category = 'delivery_workflow' LIMIT 1;

    INSERT INTO reason_status_codes (id, tenant_id, reason_status_id, name, code, sort_order, is_system, updated_at) VALUES
      (gen_random_uuid()::text, t.id, rs_del, 'Pending acceptance', 'pending', 1, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_del, 'Accepted', 'accepted', 2, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_del, 'Partially accepted', 'partial', 3, true, NOW());

    -- transfer_workflow
    INSERT INTO reason_statuses (id, tenant_id, category, name, code, updated_at)
    VALUES (gen_random_uuid()::text, t.id, 'transfer_workflow', 'Transfer workflow', 'transfer_workflow', NOW());
    SELECT id INTO rs_xfr FROM reason_statuses WHERE tenant_id = t.id AND category = 'transfer_workflow' LIMIT 1;

    INSERT INTO reason_status_codes (id, tenant_id, reason_status_id, name, code, sort_order, is_system, updated_at) VALUES
      (gen_random_uuid()::text, t.id, rs_xfr, 'Draft', 'draft', 1, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_xfr, 'Pending TL', 'pending_tl', 2, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_xfr, 'In transit', 'in_transit', 3, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_xfr, 'Completed', 'completed', 4, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_xfr, 'Cancelled', 'cancelled', 5, true, NOW());

    -- pullout_workflow
    INSERT INTO reason_statuses (id, tenant_id, category, name, code, updated_at)
    VALUES (gen_random_uuid()::text, t.id, 'pullout_workflow', 'Pull-out workflow', 'pullout_workflow', NOW());
    SELECT id INTO rs_plt FROM reason_statuses WHERE tenant_id = t.id AND category = 'pullout_workflow' LIMIT 1;

    INSERT INTO reason_status_codes (id, tenant_id, reason_status_id, name, code, sort_order, is_system, updated_at) VALUES
      (gen_random_uuid()::text, t.id, rs_plt, 'Draft', 'draft', 1, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_plt, 'Pending TL', 'pending_tl', 2, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_plt, 'Pending logistics', 'pending_logistics', 3, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_plt, 'Completed', 'completed', 4, true, NOW()),
      (gen_random_uuid()::text, t.id, rs_plt, 'Cancelled', 'cancelled', 5, true, NOW());

    -- Backfill branch_inventories
    UPDATE branch_inventories bi SET status_code_id = rsc.id
    FROM reason_status_codes rsc
    JOIN reason_statuses rs ON rs.id = rsc.reason_status_id
    WHERE bi.tenant_id = t.id AND rs.tenant_id = t.id AND rs.category = 'inventory_system'
      AND rsc.code = CASE bi.status::text
        WHEN 'DeliveryInTransit' THEN 'DIT'
        WHEN 'Stock' THEN 'STK'
        WHEN 'Sold' THEN 'SLD'
        WHEN 'Reserved' THEN 'RSV'
        WHEN 'Defective' THEN 'DEF'
        WHEN 'ForPullout' THEN 'FPO'
        ELSE 'STK'
      END;

    UPDATE branch_deliveries bd SET status_code_id = rsc.id
    FROM reason_status_codes rsc
    JOIN reason_statuses rs ON rs.id = rsc.reason_status_id
    WHERE bd.tenant_id = t.id AND rs.tenant_id = t.id AND rs.category = 'delivery_workflow'
      AND rsc.code = bd.status::text;

    UPDATE branch_transfers bt SET status_code_id = rsc.id
    FROM reason_status_codes rsc
    JOIN reason_statuses rs ON rs.id = rsc.reason_status_id
    WHERE bt.tenant_id = t.id AND rs.tenant_id = t.id AND rs.category = 'transfer_workflow'
      AND rsc.code = bt.status::text;

    UPDATE branch_pullouts bp SET status_code_id = rsc.id
    FROM reason_status_codes rsc
    JOIN reason_statuses rs ON rs.id = rsc.reason_status_id
    WHERE bp.tenant_id = t.id AND rs.tenant_id = t.id AND rs.category = 'pullout_workflow'
      AND rsc.code = bp.status::text;
  END LOOP;
END $$;

-- Drop legacy enum columns
ALTER TABLE "branch_inventories" DROP COLUMN "status";
ALTER TABLE "branch_deliveries" DROP COLUMN "status";
ALTER TABLE "branch_transfers" DROP COLUMN "status";
ALTER TABLE "branch_pullouts" DROP COLUMN "status";

-- Enforce NOT NULL
ALTER TABLE "branch_inventories" ALTER COLUMN "status_code_id" SET NOT NULL;
ALTER TABLE "branch_deliveries" ALTER COLUMN "status_code_id" SET NOT NULL;
ALTER TABLE "branch_transfers" ALTER COLUMN "status_code_id" SET NOT NULL;
ALTER TABLE "branch_pullouts" ALTER COLUMN "status_code_id" SET NOT NULL;

-- Drop legacy enums
DROP TYPE "BranchInventoryStatus";
DROP TYPE "BranchDeliveryStatus";
DROP TYPE "BranchTransferStatus";
DROP TYPE "BranchPulloutStatus";

-- Indexes
CREATE UNIQUE INDEX "reason_statuses_tenant_id_category_code_key" ON "reason_statuses"("tenant_id", "category", "code");
CREATE INDEX "reason_statuses_tenant_id_category_idx" ON "reason_statuses"("tenant_id", "category");
CREATE UNIQUE INDEX "reason_status_codes_tenant_id_reason_status_id_code_key" ON "reason_status_codes"("tenant_id", "reason_status_id", "code");
CREATE INDEX "reason_status_codes_tenant_id_idx" ON "reason_status_codes"("tenant_id");

CREATE INDEX "branch_inventories_tenant_id_branch_id_status_code_id_idx" ON "branch_inventories"("tenant_id", "branch_id", "status_code_id");
DROP INDEX IF EXISTS "branch_inventories_tenant_id_branch_id_status_idx";
CREATE INDEX "branch_deliveries_tenant_id_branch_id_status_code_id_idx" ON "branch_deliveries"("tenant_id", "branch_id", "status_code_id");
DROP INDEX IF EXISTS "branch_deliveries_tenant_id_branch_id_status_idx";
CREATE INDEX "branch_transfers_tenant_id_status_code_id_idx" ON "branch_transfers"("tenant_id", "status_code_id");
DROP INDEX IF EXISTS "branch_transfers_tenant_id_status_idx";
CREATE INDEX "branch_pullouts_tenant_id_branch_id_status_code_id_idx" ON "branch_pullouts"("tenant_id", "branch_id", "status_code_id");
DROP INDEX IF EXISTS "branch_pullouts_tenant_id_branch_id_status_idx";

-- Foreign keys
ALTER TABLE "reason_statuses" ADD CONSTRAINT "reason_statuses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reason_status_codes" ADD CONSTRAINT "reason_status_codes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reason_status_codes" ADD CONSTRAINT "reason_status_codes_reason_status_id_fkey" FOREIGN KEY ("reason_status_id") REFERENCES "reason_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_inventories" ADD CONSTRAINT "branch_inventories_status_code_id_fkey" FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_deliveries" ADD CONSTRAINT "branch_deliveries_status_code_id_fkey" FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_status_code_id_fkey" FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_status_code_id_fkey" FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_reason_status_id_fkey" FOREIGN KEY ("reason_status_id") REFERENCES "reason_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_reason_status_code_id_fkey" FOREIGN KEY ("reason_status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
