-- Sales Orders made directly in SAP are imported as ISMS orders.
CREATE TYPE "BranchOrderSource" AS ENUM ('ISMS', 'SAP');

ALTER TABLE "branch_orders" ADD COLUMN "source" "BranchOrderSource" NOT NULL DEFAULT 'ISMS';

-- Null keeps the import off until a start date is set in Ordering settings.
ALTER TABLE "ordering_policies" ADD COLUMN "sap_so_import_since" DATE;
