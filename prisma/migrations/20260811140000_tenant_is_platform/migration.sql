-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "is_platform" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tenants_is_platform_idx" ON "tenants"("is_platform");
