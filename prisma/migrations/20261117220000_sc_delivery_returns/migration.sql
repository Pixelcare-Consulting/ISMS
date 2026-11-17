-- Service center delivery rejects: units rejected at receipt of a SAP DR go back on a SAP
-- Return, like branch delivery returns. Separate tables so branch returns are untouched.

-- AlterEnum
ALTER TYPE "SapIntegrationJobType" ADD VALUE 'sc_delivery_return';

-- AlterEnum
ALTER TYPE "InventoryApprovalSource" ADD VALUE 'SC_DELIVERY_RETURN';

-- AlterTable
ALTER TABLE "service_center_delivery_lines" ADD COLUMN "returned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "sc_delivery_return_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "request_no" TEXT NOT NULL,
    "status" "DeliveryReturnStatus" NOT NULL DEFAULT 'APPROVED',
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

    CONSTRAINT "sc_delivery_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sc_delivery_return_lines" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "remarks" TEXT,
    "mark_defective" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sc_delivery_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sc_delivery_return_requests_tenant_id_request_no_key" ON "sc_delivery_return_requests"("tenant_id", "request_no");

-- CreateIndex
CREATE INDEX "sc_delivery_return_requests_tenant_id_delivery_id_idx" ON "sc_delivery_return_requests"("tenant_id", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "sc_delivery_return_lines_return_id_serial_number_id_key" ON "sc_delivery_return_lines"("return_id", "serial_number_id");

-- CreateIndex
CREATE INDEX "sc_delivery_return_lines_serial_number_id_idx" ON "sc_delivery_return_lines"("serial_number_id");

-- AddForeignKey
ALTER TABLE "sc_delivery_return_requests" ADD CONSTRAINT "sc_delivery_return_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sc_delivery_return_requests" ADD CONSTRAINT "sc_delivery_return_requests_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "service_center_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sc_delivery_return_requests" ADD CONSTRAINT "sc_delivery_return_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sc_delivery_return_requests" ADD CONSTRAINT "sc_delivery_return_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sc_delivery_return_lines" ADD CONSTRAINT "sc_delivery_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sc_delivery_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sc_delivery_return_lines" ADD CONSTRAINT "sc_delivery_return_lines_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
