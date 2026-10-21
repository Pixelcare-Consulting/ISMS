-- CreateEnum
CREATE TYPE "ModeOfPaymentKind" AS ENUM ('CONSIGNMENT', 'OUTRIGHT');

-- CreateEnum
CREATE TYPE "SapOrderDocType" AS ENUM ('ITR', 'SO');

-- CreateEnum
CREATE TYPE "DeliveryReturnStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryTransferStatus" AS ENUM ('PENDING_APPROVAL', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryTransferLineStatus" AS ENUM ('PENDING', 'APPROVED', 'REMOVED', 'RECEIVED');

-- AlterEnum
-- The new values are not used in this migration, so they are safe inside its transaction.
ALTER TYPE "SapIntegrationJobType" ADD VALUE 'delivery_return';
ALTER TYPE "SapIntegrationJobType" ADD VALUE 'delivery_transfer';

-- AlterTable
ALTER TABLE "mode_of_payments" ADD COLUMN "kind" "ModeOfPaymentKind";

-- AlterTable
ALTER TABLE "branch_orders" ADD COLUMN "sap_doc_type" "SapOrderDocType",
ADD COLUMN "sap_doc_entry" INTEGER,
ADD COLUMN "sap_doc_num" INTEGER;

-- AlterTable
ALTER TABLE "branch_order_details" ADD COLUMN "sap_line_num" INTEGER;

-- AlterTable
ALTER TABLE "branch_deliveries" ADD COLUMN "source_warehouse_id" TEXT,
ADD COLUMN "sap_doc_entry" INTEGER,
ADD COLUMN "dr_no" TEXT,
ADD COLUMN "dr_date" DATE;

-- CreateTable
CREATE TABLE "delivery_return_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "request_no" TEXT NOT NULL,
    "status" "DeliveryReturnStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reason" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "sap_doc_entry" INTEGER,
    "sap_doc_no" TEXT,
    "sap_doc_date" DATE,
    "sap_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_return_lines" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "warehouse_location_to_id" TEXT NOT NULL,

    CONSTRAINT "delivery_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_transfers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "transfer_no" TEXT NOT NULL,
    "status" "DeliveryTransferStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "release_branch_id" TEXT,
    "release_warehouse_id" TEXT,
    "receive_branch_id" TEXT,
    "receive_warehouse_id" TEXT,
    "receive_warehouse_location_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "sap_doc_entry" INTEGER,
    "sap_doc_no" TEXT,
    "sap_doc_date" DATE,
    "sap_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_transfer_lines" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "remarks" TEXT,
    "status" "DeliveryTransferLineStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "delivery_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_deliveries_tenant_id_source_warehouse_id_idx" ON "branch_deliveries"("tenant_id", "source_warehouse_id");

-- CreateIndex
CREATE INDEX "delivery_return_requests_tenant_id_delivery_id_idx" ON "delivery_return_requests"("tenant_id", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_return_requests_tenant_id_request_no_key" ON "delivery_return_requests"("tenant_id", "request_no");

-- CreateIndex
CREATE INDEX "delivery_return_lines_serial_number_id_idx" ON "delivery_return_lines"("serial_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_return_lines_return_id_serial_number_id_key" ON "delivery_return_lines"("return_id", "serial_number_id");

-- CreateIndex
CREATE INDEX "delivery_transfers_tenant_id_delivery_id_idx" ON "delivery_transfers"("tenant_id", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_transfers_tenant_id_transfer_no_key" ON "delivery_transfers"("tenant_id", "transfer_no");

-- CreateIndex
CREATE INDEX "delivery_transfer_lines_serial_number_id_idx" ON "delivery_transfer_lines"("serial_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_transfer_lines_transfer_id_serial_number_id_key" ON "delivery_transfer_lines"("transfer_id", "serial_number_id");

-- AddForeignKey
ALTER TABLE "branch_deliveries" ADD CONSTRAINT "branch_deliveries_source_warehouse_id_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_return_requests" ADD CONSTRAINT "delivery_return_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_return_requests" ADD CONSTRAINT "delivery_return_requests_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "branch_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_return_requests" ADD CONSTRAINT "delivery_return_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_return_requests" ADD CONSTRAINT "delivery_return_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_return_lines" ADD CONSTRAINT "delivery_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "delivery_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_return_lines" ADD CONSTRAINT "delivery_return_lines_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_return_lines" ADD CONSTRAINT "delivery_return_lines_warehouse_location_to_id_fkey" FOREIGN KEY ("warehouse_location_to_id") REFERENCES "warehouse_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "branch_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_release_branch_id_fkey" FOREIGN KEY ("release_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_release_warehouse_id_fkey" FOREIGN KEY ("release_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_receive_branch_id_fkey" FOREIGN KEY ("receive_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_receive_warehouse_id_fkey" FOREIGN KEY ("receive_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_receive_warehouse_location_id_fkey" FOREIGN KEY ("receive_warehouse_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfer_lines" ADD CONSTRAINT "delivery_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "delivery_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfer_lines" ADD CONSTRAINT "delivery_transfer_lines_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfer_lines" ADD CONSTRAINT "delivery_transfer_lines_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_transfer_lines" ADD CONSTRAINT "delivery_transfer_lines_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SQL-only: each side of a transfer is exactly one of branch or warehouse.
ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_release_one"
  CHECK (("release_branch_id" IS NULL) <> ("release_warehouse_id" IS NULL));

ALTER TABLE "delivery_transfers" ADD CONSTRAINT "delivery_transfers_receive_one"
  CHECK (("receive_branch_id" IS NULL) <> ("receive_warehouse_id" IS NULL));

-- SQL-only: one open return per delivery.
CREATE UNIQUE INDEX "delivery_return_open_uq" ON "delivery_return_requests"("delivery_id")
  WHERE "status" IN ('PENDING_APPROVAL', 'APPROVED');

-- SQL-only: one open transfer line per serial.
CREATE UNIQUE INDEX "delivery_transfer_line_open_uq" ON "delivery_transfer_lines"("serial_number_id")
  WHERE "status" IN ('PENDING', 'APPROVED');

-- Backfill payment mode kind from existing names. Unmatched rows stay NULL.
UPDATE "mode_of_payments" SET "kind" = 'CONSIGNMENT' WHERE "name" ILIKE '%consign%';
UPDATE "mode_of_payments" SET "kind" = 'OUTRIGHT' WHERE "name" ILIKE '%outright%';
