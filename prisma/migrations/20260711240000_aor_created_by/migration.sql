-- AlterTable
ALTER TABLE "aors" ADD COLUMN "created_by_id" TEXT;

-- CreateIndex
CREATE INDEX "aors_created_by_id_idx" ON "aors"("created_by_id");

-- AddForeignKey
ALTER TABLE "aors" ADD CONSTRAINT "aors_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
