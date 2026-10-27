-- Shelf location for branch stock: warehouse Stock in tags a branch unit with a
-- location in the branch's primary warehouse. The unit stays branch stock.

-- AlterTable
ALTER TABLE "branch_inventories" ADD COLUMN "warehouse_location_id" TEXT;

-- CreateIndex
CREATE INDEX "branch_inventories_warehouse_location_id_idx" ON "branch_inventories"("warehouse_location_id");

-- AddForeignKey
ALTER TABLE "branch_inventories" ADD CONSTRAINT "branch_inventories_warehouse_location_id_fkey" FOREIGN KEY ("warehouse_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
