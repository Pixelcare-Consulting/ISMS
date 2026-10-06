-- SAP on-hand ("In Stock") per branch and model, shown read-only on the planogram.
-- Filled by the Models and Serial numbers SAP syncs; see BranchStockLevel in schema.prisma.
CREATE TABLE "branch_stock_levels" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "on_hand_qty" INTEGER NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_stock_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_stock_levels_branch_id_model_id_key"
ON "branch_stock_levels"("branch_id", "model_id");

CREATE INDEX "branch_stock_levels_tenant_id_idx"
ON "branch_stock_levels"("tenant_id");

ALTER TABLE "branch_stock_levels"
ADD CONSTRAINT "branch_stock_levels_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_stock_levels"
ADD CONSTRAINT "branch_stock_levels_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_stock_levels"
ADD CONSTRAINT "branch_stock_levels_model_id_fkey"
FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
