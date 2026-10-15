-- Tenant-wide TL/PS free-slot budgets for Monthly SIR / P-COUNT.
CREATE TABLE "monthly_sir_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tl_monthly_free_slots" INTEGER NOT NULL DEFAULT 1,
    "ps_monthly_free_slots" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_sir_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "monthly_sir_policies_tenant_id_key" ON "monthly_sir_policies"("tenant_id");

ALTER TABLE "monthly_sir_policies"
ADD CONSTRAINT "monthly_sir_policies_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Consume free slots on free/direct Start (not only after Excel upload).
ALTER TABLE "monthly_sir_requests"
ADD COLUMN "uses_free_slot" BOOLEAN NOT NULL DEFAULT false;

-- Backfill prior direct starts that already used the free path marker.
UPDATE "monthly_sir_requests"
SET "uses_free_slot" = true
WHERE "review_remarks" = 'Direct upload allowance';

CREATE INDEX "monthly_sir_requests_tenant_id_requested_by_id_branch_id_uses_free_slot_created_at_idx"
ON "monthly_sir_requests"("tenant_id", "requested_by_id", "branch_id", "uses_free_slot", "created_at");
