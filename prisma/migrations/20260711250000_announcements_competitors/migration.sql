-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_observations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "competitor_name" TEXT NOT NULL,
    "branch_id" TEXT,
    "brand_id" TEXT,
    "model_id" TEXT,
    "price" DECIMAL(12,2),
    "notes" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_tenant_id_is_active_published_at_idx" ON "announcements"("tenant_id", "is_active", "published_at");

-- CreateIndex
CREATE INDEX "competitor_observations_tenant_id_observed_at_idx" ON "competitor_observations"("tenant_id", "observed_at");

-- CreateIndex
CREATE INDEX "competitor_observations_tenant_id_competitor_name_idx" ON "competitor_observations"("tenant_id", "competitor_name");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
