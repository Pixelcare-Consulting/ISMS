-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_id" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policies_tenant_id_idx" ON "policies"("tenant_id");

-- CreateIndex
CREATE INDEX "policies_tenant_id_status_idx" ON "policies"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_policy_id_version_key" ON "policy_versions"("policy_id", "version");

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
