-- AlterEnum
ALTER TYPE "SerialHistoryTxnType" ADD VALUE 'defect';

-- CreateEnum
CREATE TYPE "BranchDefectReportStatus" AS ENUM ('pending_inspection', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "branch_defect_reports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_inventory_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "status" "BranchDefectReportStatus" NOT NULL DEFAULT 'pending_inspection',
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "reporter_user_id" TEXT NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decider_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_defect_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_defect_report_photos" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_defect_report_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_defect_reports_tenant_id_status_reported_at_idx" ON "branch_defect_reports"("tenant_id", "status", "reported_at");

-- CreateIndex
CREATE INDEX "branch_defect_reports_tenant_id_branch_id_status_idx" ON "branch_defect_reports"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "branch_defect_reports_branch_inventory_id_idx" ON "branch_defect_reports"("branch_inventory_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_defect_reports_one_pending_per_inventory" ON "branch_defect_reports"("branch_inventory_id") WHERE ("status" = 'pending_inspection');

-- CreateIndex
CREATE INDEX "branch_defect_report_photos_report_id_idx" ON "branch_defect_report_photos"("report_id");

-- AddForeignKey
ALTER TABLE "branch_defect_reports" ADD CONSTRAINT "branch_defect_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_defect_reports" ADD CONSTRAINT "branch_defect_reports_branch_inventory_id_fkey" FOREIGN KEY ("branch_inventory_id") REFERENCES "branch_inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_defect_reports" ADD CONSTRAINT "branch_defect_reports_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_defect_reports" ADD CONSTRAINT "branch_defect_reports_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_defect_reports" ADD CONSTRAINT "branch_defect_reports_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_defect_reports" ADD CONSTRAINT "branch_defect_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_defect_reports" ADD CONSTRAINT "branch_defect_reports_decider_user_id_fkey" FOREIGN KEY ("decider_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_defect_report_photos" ADD CONSTRAINT "branch_defect_report_photos_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "branch_defect_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_defect_report_photos" ADD CONSTRAINT "branch_defect_report_photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
