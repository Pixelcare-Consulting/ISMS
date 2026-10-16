-- CreateEnum
CREATE TYPE "AiAutomationTemplate" AS ENUM ('daily_briefing', 'replenishment_review', 'pending_work_reminder');

-- CreateEnum
CREATE TYPE "AiAutomationRunTrigger" AS ENUM ('schedule', 'manual', 'preview');

-- CreateEnum
CREATE TYPE "AiAutomationRunStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AiReplenishmentProposalStatus" AS ENUM ('proposed', 'confirmed', 'superseded');

-- CreateTable
CREATE TABLE "ai_automations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "template" "AiAutomationTemplate" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "time_of_day_minutes" INTEGER NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "branch_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thresholds" JSONB NOT NULL DEFAULT '{}',
    "recipient_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_automation_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "trigger" "AiAutomationRunTrigger" NOT NULL,
    "actor_user_id" TEXT,
    "status" "AiAutomationRunStatus" NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "slot" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ai_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_replenishment_proposals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "local_day" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "status" "AiReplenishmentProposalStatus" NOT NULL DEFAULT 'proposed',
    "order_id" TEXT,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_replenishment_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_automations_enabled_idx" ON "ai_automations"("enabled");

-- CreateIndex
CREATE INDEX "ai_automations_tenant_id_enabled_idx" ON "ai_automations"("tenant_id", "enabled");

-- CreateIndex
CREATE INDEX "ai_automations_owner_user_id_idx" ON "ai_automations"("owner_user_id");

-- CreateIndex
CREATE INDEX "ai_automation_runs_tenant_id_started_at_idx" ON "ai_automation_runs"("tenant_id", "started_at");

-- CreateIndex
CREATE INDEX "ai_automation_runs_automation_id_started_at_idx" ON "ai_automation_runs"("automation_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_automation_runs_automation_id_slot_key" ON "ai_automation_runs"("automation_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "ai_replenishment_proposals_order_id_key" ON "ai_replenishment_proposals"("order_id");

-- CreateIndex
CREATE INDEX "ai_replenishment_proposals_tenant_id_branch_id_local_day_idx" ON "ai_replenishment_proposals"("tenant_id", "branch_id", "local_day");

-- CreateIndex
CREATE INDEX "ai_replenishment_proposals_run_id_idx" ON "ai_replenishment_proposals"("run_id");

-- AddForeignKey
ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "ai_automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_replenishment_proposals" ADD CONSTRAINT "ai_replenishment_proposals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_replenishment_proposals" ADD CONSTRAINT "ai_replenishment_proposals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_automation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_replenishment_proposals" ADD CONSTRAINT "ai_replenishment_proposals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_replenishment_proposals" ADD CONSTRAINT "ai_replenishment_proposals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "branch_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_replenishment_proposals" ADD CONSTRAINT "ai_replenishment_proposals_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One open proposal per tenant + branch + local day. Confirmed and superseded rows stay.
CREATE UNIQUE INDEX "ai_replenishment_proposals_one_open_per_branch_day" ON "ai_replenishment_proposals"("tenant_id", "branch_id", "local_day") WHERE ("status" = 'proposed');
