-- CreateEnum
CREATE TYPE "CustomDashboardVisibility" AS ENUM ('PRIVATE', 'TENANT');

-- CreateTable
CREATE TABLE "custom_dashboards" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" JSONB NOT NULL,
    "visibility" "CustomDashboardVisibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_dashboards_tenant_id_visibility_idx" ON "custom_dashboards"("tenant_id", "visibility");

-- CreateIndex
CREATE INDEX "custom_dashboards_tenant_id_owner_user_id_idx" ON "custom_dashboards"("tenant_id", "owner_user_id");

-- AddForeignKey
ALTER TABLE "custom_dashboards" ADD CONSTRAINT "custom_dashboards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_dashboards" ADD CONSTRAINT "custom_dashboards_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
