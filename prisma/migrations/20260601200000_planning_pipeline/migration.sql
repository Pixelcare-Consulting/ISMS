-- AlterTable
ALTER TABLE "product_models" ADD COLUMN "srp" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "planning_periods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_forecast_targets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "revenue_target" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_forecast_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_allocations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "planogram_max" INTEGER NOT NULL,
    "current_stock" INTEGER NOT NULL,
    "gap_qty" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planning_periods_tenant_id_idx" ON "planning_periods"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_periods_tenant_id_label_key" ON "planning_periods"("tenant_id", "label");

-- CreateIndex
CREATE INDEX "branch_forecast_targets_tenant_id_idx" ON "branch_forecast_targets"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_forecast_targets_period_id_branch_id_key" ON "branch_forecast_targets"("period_id", "branch_id");

-- CreateIndex
CREATE INDEX "branch_allocations_tenant_id_period_id_idx" ON "branch_allocations"("tenant_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_allocations_period_id_branch_id_model_id_key" ON "branch_allocations"("period_id", "branch_id", "model_id");

-- AddForeignKey
ALTER TABLE "planning_periods" ADD CONSTRAINT "planning_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_forecast_targets" ADD CONSTRAINT "branch_forecast_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_forecast_targets" ADD CONSTRAINT "branch_forecast_targets_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "planning_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_forecast_targets" ADD CONSTRAINT "branch_forecast_targets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_allocations" ADD CONSTRAINT "branch_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_allocations" ADD CONSTRAINT "branch_allocations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "planning_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_allocations" ADD CONSTRAINT "branch_allocations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_allocations" ADD CONSTRAINT "branch_allocations_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
