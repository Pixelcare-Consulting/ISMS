-- CreateTable
CREATE TABLE "branch_allowed_models" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_allowed_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_allowed_models_tenant_id_idx" ON "branch_allowed_models"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_allowed_models_branch_id_model_id_key" ON "branch_allowed_models"("branch_id", "model_id");

-- AddForeignKey
ALTER TABLE "branch_allowed_models" ADD CONSTRAINT "branch_allowed_models_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_allowed_models" ADD CONSTRAINT "branch_allowed_models_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_allowed_models" ADD CONSTRAINT "branch_allowed_models_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed allow-list from existing planogram membership
INSERT INTO branch_allowed_models (id, tenant_id, branch_id, model_id, created_at, updated_at)
SELECT gen_random_uuid(), tenant_id, branch_id, model_id, now(), now()
FROM branch_planograms
ON CONFLICT (branch_id, model_id) DO NOTHING;
