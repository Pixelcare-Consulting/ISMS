-- Process Return: action type, stock status, problem text, service extras on branch_return_requests

-- CreateEnum
CREATE TYPE "ReturnActionType" AS ENUM ('return', 'replacement');

-- CreateEnum
CREATE TYPE "ReturnStockStatusCode" AS ENUM ('STK', 'DEF');

-- AlterTable
ALTER TABLE "branch_return_requests"
  ADD COLUMN IF NOT EXISTS "action_type" "ReturnActionType",
  ADD COLUMN IF NOT EXISTS "stock_status_code" "ReturnStockStatusCode",
  ADD COLUMN IF NOT EXISTS "problem_description_text" TEXT,
  ADD COLUMN IF NOT EXISTS "service_center_id" TEXT,
  ADD COLUMN IF NOT EXISTS "classification" TEXT,
  ADD COLUMN IF NOT EXISTS "service_model_id" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_dealer_branch" TEXT,
  ADD COLUMN IF NOT EXISTS "nature_of_transaction" TEXT,
  ADD COLUMN IF NOT EXISTS "ref_contact_po" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse_location_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "branch_return_requests_tenant_id_action_type_idx"
  ON "branch_return_requests"("tenant_id", "action_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "branch_return_requests_document_type_id_idx"
  ON "branch_return_requests"("document_type_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "branch_return_requests_service_center_id_idx"
  ON "branch_return_requests"("service_center_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "branch_return_requests_service_model_id_idx"
  ON "branch_return_requests"("service_model_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "branch_return_requests_warehouse_location_id_idx"
  ON "branch_return_requests"("warehouse_location_id");

-- AddForeignKey
ALTER TABLE "branch_return_requests"
  ADD CONSTRAINT "branch_return_requests_service_center_id_fkey"
  FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests"
  ADD CONSTRAINT "branch_return_requests_service_model_id_fkey"
  FOREIGN KEY ("service_model_id") REFERENCES "product_models"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests"
  ADD CONSTRAINT "branch_return_requests_warehouse_location_id_fkey"
  FOREIGN KEY ("warehouse_location_id") REFERENCES "warehouse_locations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
