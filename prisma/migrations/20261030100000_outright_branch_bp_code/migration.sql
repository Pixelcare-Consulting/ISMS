-- Outright SOs bill the branch warehouse's BP Code (OWHS.U_CardCode), synced from SAP.
ALTER TABLE "branches" ADD COLUMN "bp_code" TEXT;

-- The SO customer is stored at final approval, like sap_doc_type.
ALTER TABLE "branch_orders" ADD COLUMN "sap_card_code" TEXT;

-- SOs approved before this change were validated against the branch dealer's code: keep it.
UPDATE "branch_orders" o
   SET "sap_card_code" = d."sap_code"
  FROM "branches" b
  JOIN "dealers" d ON d."id" = b."dealer_id"
 WHERE o."branch_id" = b."id"
   AND o."sap_doc_type" = 'SO'
   AND o."sap_card_code" IS NULL;
