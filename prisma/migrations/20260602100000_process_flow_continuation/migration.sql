-- Process flow continuation: transfer/pullout lines, returns, stock count, SAP queue

-- CreateEnum
CREATE TYPE "StockCountSessionStatus" AS ENUM ('draft', 'in_progress', 'counting_complete', 'variances_under_investigation', 'pending_adjustment', 'adjustment_requested', 'closed');

-- CreateEnum
CREATE TYPE "StockCountLineStatus" AS ENUM ('pending', 'counted', 'variance', 'resolved');

-- CreateEnum
CREATE TYPE "StockVarianceStatus" AS ENUM ('open', 'investigating', 'approved_adjustment', 'rejected', 'sap_handoff', 'closed');

-- CreateEnum
CREATE TYPE "SapIntegrationJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead_letter');

-- CreateEnum
CREATE TYPE "SapIntegrationJobType" AS ENUM ('approved_order', 'pullout_itr', 'sales_summary', 'inventory_sync_inbound', 'inventory_adjustment', 'delivery_sync_inbound');

-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('pending_cs', 'pending_tl', 'approved', 'rejected', 'completed');

-- AlterTable
ALTER TABLE "branch_orders" ADD COLUMN "sap_doc_ref" TEXT;

-- AlterTable
ALTER TABLE "branch_deliveries" ADD COLUMN "sap_doc_ref" TEXT;

-- AlterTable
ALTER TABLE "branch_pullouts" ADD COLUMN "sap_doc_ref" TEXT;

-- CreateTable
CREATE TABLE "branch_transfer_lines" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "branch_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_pullout_lines" (
    "id" TEXT NOT NULL,
    "pullout_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,

    CONSTRAINT "branch_pullout_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_return_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'pending_cs',
    "request_notes" TEXT,
    "evaluation_notes" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "evaluated_by_id" TEXT,
    "approved_by_id" TEXT,
    "evaluated_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "session_no" TEXT NOT NULL,
    "status" "StockCountSessionStatus" NOT NULL DEFAULT 'draft',
    "created_by_id" TEXT NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "branch_inventory_id" TEXT,
    "serial_number_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "system_status_code_id" TEXT NOT NULL,
    "expected_in_count" BOOLEAN NOT NULL DEFAULT true,
    "status" "StockCountLineStatus" NOT NULL DEFAULT 'pending',
    "counted_at" TIMESTAMP(3),
    "counted_by_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_variances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "line_id" TEXT,
    "variance_type" TEXT NOT NULL,
    "status" "StockVarianceStatus" NOT NULL DEFAULT 'open',
    "description" TEXT,
    "investigated_by_id" TEXT,
    "investigated_at" TIMESTAMP(3),
    "investigation_notes" TEXT,
    "adjustment_requested_at" TIMESTAMP(3),
    "adjustment_requested_by_id" TEXT,
    "sap_doc_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_variances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sap_integration_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_type" "SapIntegrationJobType" NOT NULL,
    "status" "SapIntegrationJobStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "sap_doc_ref" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sap_integration_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_transfer_lines_transfer_id_serial_number_id_key" ON "branch_transfer_lines"("transfer_id", "serial_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_pullout_lines_pullout_id_serial_number_id_key" ON "branch_pullout_lines"("pullout_id", "serial_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_return_requests_sale_id_key" ON "branch_return_requests"("sale_id");

-- CreateIndex
CREATE INDEX "branch_return_requests_tenant_id_status_idx" ON "branch_return_requests"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_sessions_tenant_id_session_no_key" ON "stock_count_sessions"("tenant_id", "session_no");

-- CreateIndex
CREATE INDEX "stock_count_sessions_tenant_id_branch_id_status_idx" ON "stock_count_sessions"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "stock_count_lines_session_id_status_idx" ON "stock_count_lines"("session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_variances_line_id_key" ON "stock_variances"("line_id");

-- CreateIndex
CREATE INDEX "stock_variances_tenant_id_session_id_status_idx" ON "stock_variances"("tenant_id", "session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sap_integration_jobs_tenant_id_idempotency_key_key" ON "sap_integration_jobs"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sap_integration_jobs_tenant_id_status_next_retry_at_idx" ON "sap_integration_jobs"("tenant_id", "status", "next_retry_at");

-- CreateIndex
CREATE INDEX "sap_integration_jobs_tenant_id_reference_type_reference_id_idx" ON "sap_integration_jobs"("tenant_id", "reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "branch_deliveries_tenant_id_sap_doc_ref_idx" ON "branch_deliveries"("tenant_id", "sap_doc_ref");

-- AddForeignKey
ALTER TABLE "branch_transfer_lines" ADD CONSTRAINT "branch_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "branch_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfer_lines" ADD CONSTRAINT "branch_transfer_lines_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_lines" ADD CONSTRAINT "branch_pullout_lines_pullout_id_fkey" FOREIGN KEY ("pullout_id") REFERENCES "branch_pullouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_lines" ADD CONSTRAINT "branch_pullout_lines_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "branch_sales_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_evaluated_by_id_fkey" FOREIGN KEY ("evaluated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stock_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_branch_inventory_id_fkey" FOREIGN KEY ("branch_inventory_id") REFERENCES "branch_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_counted_by_id_fkey" FOREIGN KEY ("counted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stock_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "stock_count_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_investigated_by_id_fkey" FOREIGN KEY ("investigated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_adjustment_requested_by_id_fkey" FOREIGN KEY ("adjustment_requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sap_integration_jobs" ADD CONSTRAINT "sap_integration_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
