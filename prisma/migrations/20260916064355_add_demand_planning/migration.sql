-- CreateEnum
CREATE TYPE "DemandPlanningRunStatus" AS ENUM ('draft', 'generated', 'released', 'superseded');

-- CreateEnum
CREATE TYPE "DemandPlanningPlanStatus" AS ENUM ('planned', 'no_history', 'awaiting');

-- CreateTable
CREATE TABLE "sku_forecast_targets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_forecast_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_planning_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DemandPlanningRunStatus" NOT NULL DEFAULT 'draft',
    "name" TEXT,
    "scope" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "history_from" TIMESTAMP(3),
    "history_to" TIMESTAMP(3),
    "history_sku_count" INTEGER,
    "history_peso" DECIMAL(14,2),
    "planogram_y_count" INTEGER,
    "planogram_sku_count" INTEGER,
    "forecast_unit_count" INTEGER,
    "forecast_peso" DECIMAL(14,2),
    "on_hand_unit_count" INTEGER,
    "on_hand_peso" DECIMAL(14,2),
    "on_hand_as_at" TIMESTAMP(3),
    "display_units_count" INTEGER,
    "released_at" TIMESTAMP(3),
    "supersedes_run_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_planning_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_planning_run_branches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "plan_status" "DemandPlanningPlanStatus" NOT NULL DEFAULT 'awaiting',
    "quota_peso" DECIMAL(14,2) NOT NULL,
    "min_level_days" DECIMAL(8,4) NOT NULL,
    "min_level_peso" DECIMAL(14,2) NOT NULL,
    "drops_per_month" DECIMAL(8,4) NOT NULL,
    "history_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "history_peso" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mil_qty" INTEGER NOT NULL DEFAULT 0,
    "mil_peso" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "display_units" INTEGER NOT NULL DEFAULT 0,
    "on_hand_qty" INTEGER NOT NULL DEFAULT 0,
    "forecast_qty" INTEGER NOT NULL DEFAULT 0,
    "forecast_peso" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "alloc_qty" INTEGER NOT NULL DEFAULT 0,
    "alloc_peso" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "drop1_qty" INTEGER NOT NULL DEFAULT 0,
    "drop1_peso" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cycle_qty" INTEGER NOT NULL DEFAULT 0,
    "planogram_sku_count" INTEGER NOT NULL DEFAULT 0,
    "coverage_days" DECIMAL(8,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_planning_run_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_planning_lines" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "run_branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "sku_code" TEXT NOT NULL,
    "series_code" TEXT NOT NULL,
    "srp" DECIMAL(12,2) NOT NULL,
    "planogram_flag" TEXT NOT NULL,
    "history_qty" DECIMAL(14,4) NOT NULL,
    "history_peso" DECIMAL(14,2) NOT NULL,
    "hmix" DECIMAL(18,10) NOT NULL,
    "adj_hmix" DECIMAL(18,10) NOT NULL,
    "mil_qty" INTEGER NOT NULL,
    "mil_peso" DECIMAL(14,2) NOT NULL,
    "computed_display_units" INTEGER NOT NULL,
    "display_units" INTEGER NOT NULL,
    "on_hand_qty" INTEGER NOT NULL,
    "computed_forecast_qty" INTEGER NOT NULL,
    "forecast_qty" INTEGER NOT NULL,
    "forecast_peso" DECIMAL(14,2) NOT NULL,
    "alloc_qty" INTEGER NOT NULL,
    "alloc_peso" DECIMAL(14,2) NOT NULL,
    "cycle_qty" INTEGER NOT NULL,
    "computed_drop1_qty" INTEGER NOT NULL,
    "released_drop1_qty" INTEGER,
    "drop1_peso" DECIMAL(14,2) NOT NULL,
    "total_inventory_qty" INTEGER NOT NULL,
    "total_inventory_peso" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_planning_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_planning_overrides" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "run_branch_id" TEXT,
    "line_id" TEXT,
    "user_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before_value" TEXT NOT NULL,
    "after_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_planning_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sku_forecast_targets_tenant_id_period_id_idx" ON "sku_forecast_targets"("tenant_id", "period_id");

-- CreateIndex
CREATE INDEX "sku_forecast_targets_tenant_id_branch_id_idx" ON "sku_forecast_targets"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "sku_forecast_targets_period_id_branch_id_model_id_key" ON "sku_forecast_targets"("period_id", "branch_id", "model_id");

-- CreateIndex
CREATE INDEX "demand_planning_runs_tenant_id_period_id_idx" ON "demand_planning_runs"("tenant_id", "period_id");

-- CreateIndex
CREATE INDEX "demand_planning_runs_tenant_id_status_idx" ON "demand_planning_runs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "demand_planning_runs_created_by_id_idx" ON "demand_planning_runs"("created_by_id");

-- CreateIndex
CREATE INDEX "demand_planning_runs_supersedes_run_id_idx" ON "demand_planning_runs"("supersedes_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "demand_planning_runs_tenant_id_document_number_key" ON "demand_planning_runs"("tenant_id", "document_number");

-- CreateIndex
CREATE INDEX "demand_planning_run_branches_tenant_id_run_id_idx" ON "demand_planning_run_branches"("tenant_id", "run_id");

-- CreateIndex
CREATE INDEX "demand_planning_run_branches_branch_id_idx" ON "demand_planning_run_branches"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "demand_planning_run_branches_run_id_branch_id_key" ON "demand_planning_run_branches"("run_id", "branch_id");

-- CreateIndex
CREATE INDEX "demand_planning_lines_tenant_id_run_id_idx" ON "demand_planning_lines"("tenant_id", "run_id");

-- CreateIndex
CREATE INDEX "demand_planning_lines_run_id_idx" ON "demand_planning_lines"("run_id");

-- CreateIndex
CREATE INDEX "demand_planning_lines_model_id_idx" ON "demand_planning_lines"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "demand_planning_lines_run_branch_id_model_id_key" ON "demand_planning_lines"("run_branch_id", "model_id");

-- CreateIndex
CREATE INDEX "demand_planning_overrides_tenant_id_run_id_idx" ON "demand_planning_overrides"("tenant_id", "run_id");

-- CreateIndex
CREATE INDEX "demand_planning_overrides_run_branch_id_idx" ON "demand_planning_overrides"("run_branch_id");

-- CreateIndex
CREATE INDEX "demand_planning_overrides_line_id_idx" ON "demand_planning_overrides"("line_id");

-- CreateIndex
CREATE INDEX "demand_planning_overrides_user_id_idx" ON "demand_planning_overrides"("user_id");

-- AddForeignKey
ALTER TABLE "sku_forecast_targets" ADD CONSTRAINT "sku_forecast_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_forecast_targets" ADD CONSTRAINT "sku_forecast_targets_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "planning_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_forecast_targets" ADD CONSTRAINT "sku_forecast_targets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_forecast_targets" ADD CONSTRAINT "sku_forecast_targets_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_runs" ADD CONSTRAINT "demand_planning_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_runs" ADD CONSTRAINT "demand_planning_runs_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "planning_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_runs" ADD CONSTRAINT "demand_planning_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_runs" ADD CONSTRAINT "demand_planning_runs_supersedes_run_id_fkey" FOREIGN KEY ("supersedes_run_id") REFERENCES "demand_planning_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_run_branches" ADD CONSTRAINT "demand_planning_run_branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_run_branches" ADD CONSTRAINT "demand_planning_run_branches_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "demand_planning_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_run_branches" ADD CONSTRAINT "demand_planning_run_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_lines" ADD CONSTRAINT "demand_planning_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_lines" ADD CONSTRAINT "demand_planning_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "demand_planning_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_lines" ADD CONSTRAINT "demand_planning_lines_run_branch_id_fkey" FOREIGN KEY ("run_branch_id") REFERENCES "demand_planning_run_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_lines" ADD CONSTRAINT "demand_planning_lines_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_overrides" ADD CONSTRAINT "demand_planning_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_overrides" ADD CONSTRAINT "demand_planning_overrides_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "demand_planning_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_overrides" ADD CONSTRAINT "demand_planning_overrides_run_branch_id_fkey" FOREIGN KEY ("run_branch_id") REFERENCES "demand_planning_run_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_overrides" ADD CONSTRAINT "demand_planning_overrides_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "demand_planning_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_planning_overrides" ADD CONSTRAINT "demand_planning_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
