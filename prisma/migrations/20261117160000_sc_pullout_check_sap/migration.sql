-- Check SAP on service center pull-outs, as on branch pull-outs: each sent unit records the
-- IT or Return SAP users made with the pull-out number in the row UDF, and the SC delivery
-- made when a DR redelivered it. All columns nullable: existing details stay unlinked.

ALTER TABLE "service_center_pullout_details"
  ADD COLUMN "sap_doc_type" "PulloutSapDocType",
  ADD COLUMN "sap_doc_entry" INTEGER,
  ADD COLUMN "sap_doc_num" INTEGER,
  ADD COLUMN "sap_doc_date" DATE,
  ADD COLUMN "sap_doc_linked_at" TIMESTAMP(3),
  ADD COLUMN "sap_doc_linked_by_id" TEXT,
  ADD COLUMN "redelivery_delivery_id" TEXT;

ALTER TABLE "service_center_pullout_details"
  ADD CONSTRAINT "service_center_pullout_details_sap_doc_linked_by_id_fkey"
  FOREIGN KEY ("sap_doc_linked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_pullout_details"
  ADD CONSTRAINT "service_center_pullout_details_redelivery_delivery_id_fkey"
  FOREIGN KEY ("redelivery_delivery_id") REFERENCES "service_center_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "service_center_pullout_details_sap_doc_linked_by_id_idx" ON "service_center_pullout_details"("sap_doc_linked_by_id");
CREATE INDEX "service_center_pullout_details_sap_doc_type_sap_doc_num_idx" ON "service_center_pullout_details"("sap_doc_type", "sap_doc_num");
CREATE INDEX "service_center_pullout_details_redelivery_delivery_id_idx" ON "service_center_pullout_details"("redelivery_delivery_id");
