-- Service-center order "Check SAP": each SAP DR copied from an SC order's SO becomes an SC
-- delivery holding the DR's serials, which arrive DIT and are accepted to STK.

-- The DR a delivery came from. Null on deliveries made in ISMS before Check SAP.
ALTER TABLE "service_center_deliveries"
ADD COLUMN "sap_doc_entry" INTEGER,
ADD COLUMN "sap_doc_num" INTEGER,
ADD COLUMN "sap_doc_no" TEXT,
ADD COLUMN "sap_doc_date" DATE;

-- One delivery per DR. Postgres allows many NULLs, so older deliveries are unaffected.
CREATE UNIQUE INDEX "service_center_deliveries_tenant_id_sap_doc_entry_key"
ON "service_center_deliveries"("tenant_id", "sap_doc_entry");

-- Set once SAP closes the SO and all its DRs are in ISMS; Check SAP then skips the order.
ALTER TABLE "service_center_orders"
ADD COLUMN "sap_closed_at" TIMESTAMP(3);

-- Serials a DR shipped on a delivery.
CREATE TABLE "service_center_delivery_lines" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_center_delivery_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_center_delivery_lines_delivery_id_serial_number_id_key"
ON "service_center_delivery_lines"("delivery_id", "serial_number_id");

CREATE INDEX "service_center_delivery_lines_serial_number_id_idx"
ON "service_center_delivery_lines"("serial_number_id");

ALTER TABLE "service_center_delivery_lines"
ADD CONSTRAINT "service_center_delivery_lines_delivery_id_fkey"
FOREIGN KEY ("delivery_id") REFERENCES "service_center_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_center_delivery_lines"
ADD CONSTRAINT "service_center_delivery_lines_serial_number_id_fkey"
FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
