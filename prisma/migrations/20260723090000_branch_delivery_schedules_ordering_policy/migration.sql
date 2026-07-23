-- Branch delivery schedules + tenant-wide ordering policy

CREATE TYPE "DeliveryFrequency" AS ENUM ('weekly', 'biweekly', 'triweekly', 'monthly', 'twice_weekly');

CREATE TABLE "ordering_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "global_locked_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[0]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ordering_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ordering_policies_tenant_id_key" ON "ordering_policies"("tenant_id");

ALTER TABLE "ordering_policies"
  ADD CONSTRAINT "ordering_policies_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "branch_delivery_schedules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "f_code" TEXT,
    "frequency" "DeliveryFrequency" NOT NULL,
    "delivery_days" INTEGER[],
    "order_days" INTEGER[],
    "notes" TEXT,
    "sp_remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "branch_delivery_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_delivery_schedules_branch_id_key" ON "branch_delivery_schedules"("branch_id");
CREATE INDEX "branch_delivery_schedules_tenant_id_idx" ON "branch_delivery_schedules"("tenant_id");

ALTER TABLE "branch_delivery_schedules"
  ADD CONSTRAINT "branch_delivery_schedules_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_delivery_schedules"
  ADD CONSTRAINT "branch_delivery_schedules_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
