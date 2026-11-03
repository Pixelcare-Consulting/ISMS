-- DR# becomes the delivery receipt number (the IT's DCS Remarks); the SAP document
-- number that dr_no held until now moves to sap_doc_no.
ALTER TABLE "branch_deliveries" ADD COLUMN "sap_doc_no" TEXT;

UPDATE "branch_deliveries" SET "sap_doc_no" = "dr_no" WHERE "dr_no" IS NOT NULL;

-- Consignment (ITR → IT) deliveries: dr_no held the IT number, not a DR#. Clear it so the
-- next SAP check fills it from DCS Remarks.
UPDATE "branch_deliveries" d
   SET "dr_no" = NULL
  FROM "branch_orders" o
 WHERE d."order_id" = o."id"
   AND o."sap_doc_type" = 'ITR'
   AND d."sap_doc_entry" IS NOT NULL;
