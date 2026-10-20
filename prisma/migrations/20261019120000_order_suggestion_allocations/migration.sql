-- How much of a published suggestion one order line consumed.
-- source_kind is application text only: planning_drop1 | shelf_gap.

CREATE TABLE "order_suggestion_allocations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_detail_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "order_type" "BranchOrderType" NOT NULL,
    "source_kind" TEXT NOT NULL,
    "period_id" TEXT,
    "planning_run_id" TEXT,
    "allocated_qty" INTEGER NOT NULL,
    "source_qty" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_suggestion_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_suggestion_allocations_order_detail_id_key" ON "order_suggestion_allocations"("order_detail_id");

-- Default Prisma name exceeds Postgres' 63-byte identifier limit.
CREATE INDEX "osa_tenant_branch_model_order_type_idx" ON "order_suggestion_allocations"("tenant_id", "branch_id", "model_id", "order_type");

CREATE INDEX "order_suggestion_allocations_period_id_idx" ON "order_suggestion_allocations"("period_id");

ALTER TABLE "order_suggestion_allocations" ADD CONSTRAINT "order_suggestion_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_suggestion_allocations" ADD CONSTRAINT "order_suggestion_allocations_order_detail_id_fkey" FOREIGN KEY ("order_detail_id") REFERENCES "branch_order_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_suggestion_allocations" ADD CONSTRAINT "order_suggestion_allocations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_suggestion_allocations" ADD CONSTRAINT "order_suggestion_allocations_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_suggestion_allocations" ADD CONSTRAINT "order_suggestion_allocations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "planning_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_suggestion_allocations" ADD CONSTRAINT "order_suggestion_allocations_planning_run_id_fkey" FOREIGN KEY ("planning_run_id") REFERENCES "demand_planning_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
