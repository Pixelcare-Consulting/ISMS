CREATE TYPE "MonthlySirRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "monthly_sir_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "MonthlySirRequestStatus" NOT NULL DEFAULT 'pending',
    "review_remarks" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "stock_count_session_id" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_sir_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "monthly_sir_requests_stock_count_session_id_key"
ON "monthly_sir_requests"("stock_count_session_id");

CREATE INDEX "monthly_sir_requests_tenant_id_status_idx"
ON "monthly_sir_requests"("tenant_id", "status");

CREATE INDEX "monthly_sir_requests_tenant_id_branch_id_idx"
ON "monthly_sir_requests"("tenant_id", "branch_id");

ALTER TABLE "monthly_sir_requests"
ADD CONSTRAINT "monthly_sir_requests_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "monthly_sir_requests"
ADD CONSTRAINT "monthly_sir_requests_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "monthly_sir_requests"
ADD CONSTRAINT "monthly_sir_requests_requested_by_id_fkey"
FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "monthly_sir_requests"
ADD CONSTRAINT "monthly_sir_requests_reviewed_by_id_fkey"
FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "monthly_sir_requests"
ADD CONSTRAINT "monthly_sir_requests_uploaded_by_id_fkey"
FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "monthly_sir_requests"
ADD CONSTRAINT "monthly_sir_requests_stock_count_session_id_fkey"
FOREIGN KEY ("stock_count_session_id") REFERENCES "stock_count_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
