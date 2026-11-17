-- Process V-b (Service Return / Service Replacement) runs on service center sales, not branch
-- sales. Its fields move from branch_return_requests to service_center_return_requests; the
-- selling service center inspects the unit and finishes the request. The dropped branch and
-- sales_replacements columns held no data (checked 2026-11-17).

-- DropForeignKey
ALTER TABLE "branch_return_requests" DROP CONSTRAINT "branch_return_requests_inspected_by_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_return_requests" DROP CONSTRAINT "branch_return_requests_special_order_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_return_requests" DROP CONSTRAINT "branch_return_requests_held_serial_number_id_fkey";

-- DropForeignKey
ALTER TABLE "sales_replacements" DROP CONSTRAINT "sales_replacements_replacement_service_center_id_fkey";

-- DropIndex
DROP INDEX "branch_return_requests_special_order_id_key";

-- DropIndex
DROP INDEX "branch_return_requests_tenant_id_service_center_id_status_idx";

-- DropIndex
DROP INDEX "branch_return_requests_inspected_by_id_idx";

-- DropIndex
DROP INDEX "branch_return_requests_held_serial_number_id_idx";

-- DropIndex
DROP INDEX "sales_replacements_replacement_service_center_id_idx";

-- AlterTable
ALTER TABLE "branch_return_requests" DROP COLUMN "held_serial_number_id",
DROP COLUMN "inspected_at",
DROP COLUMN "inspected_by_id",
DROP COLUMN "special_order_id";

-- AlterTable
ALTER TABLE "sales_replacements" DROP COLUMN "replacement_service_center_id";

-- AlterTable
ALTER TABLE "service_center_return_requests" ADD COLUMN     "action_type" "ReturnActionType",
ADD COLUMN     "atr_odrf_pdf_path" TEXT,
ADD COLUMN     "classification" TEXT,
ADD COLUMN     "customer_dealer_branch" TEXT,
ADD COLUMN     "document_type_id" TEXT,
ADD COLUMN     "held_serial_number_id" TEXT,
ADD COLUMN     "inspected_at" TIMESTAMP(3),
ADD COLUMN     "inspected_by_id" TEXT,
ADD COLUMN     "nature_of_transaction" TEXT,
ADD COLUMN     "prior_status_code" TEXT,
ADD COLUMN     "problem_description_id" TEXT,
ADD COLUMN     "problem_description_text" TEXT,
ADD COLUMN     "ref_contact_po" TEXT,
ADD COLUMN     "replacement_serial_number_id" TEXT,
ADD COLUMN     "sale_detail_id" TEXT,
ADD COLUMN     "service_center_location_id" TEXT,
ADD COLUMN     "service_model_id" TEXT,
ADD COLUMN     "special_order_id" TEXT,
ADD COLUMN     "stock_status_code" "ReturnStockStatusCode",
ADD COLUMN     "warehouse_location_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "service_center_return_requests_special_order_id_key" ON "service_center_return_requests"("special_order_id");

-- CreateIndex
CREATE INDEX "service_center_return_requests_sale_detail_id_idx" ON "service_center_return_requests"("sale_detail_id");

-- CreateIndex
CREATE INDEX "service_center_return_requests_document_type_id_idx" ON "service_center_return_requests"("document_type_id");

-- CreateIndex
CREATE INDEX "service_center_return_requests_inspected_by_id_idx" ON "service_center_return_requests"("inspected_by_id");

-- CreateIndex
CREATE INDEX "service_center_return_requests_held_serial_number_id_idx" ON "service_center_return_requests"("held_serial_number_id");

-- CreateIndex
CREATE INDEX "service_center_return_requests_replacement_serial_number_id_idx" ON "service_center_return_requests"("replacement_serial_number_id");

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_sale_detail_id_fkey" FOREIGN KEY ("sale_detail_id") REFERENCES "service_center_sales_transaction_details"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_problem_description_id_fkey" FOREIGN KEY ("problem_description_id") REFERENCES "problem_descriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_service_model_id_fkey" FOREIGN KEY ("service_model_id") REFERENCES "product_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_warehouse_location_id_fkey" FOREIGN KEY ("warehouse_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_special_order_id_fkey" FOREIGN KEY ("special_order_id") REFERENCES "service_center_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_held_serial_number_id_fkey" FOREIGN KEY ("held_serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_replacement_serial_number_i_fkey" FOREIGN KEY ("replacement_serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

