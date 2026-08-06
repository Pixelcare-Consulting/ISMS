-- CreateTable
CREATE TABLE "service_center_return_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'pending_cs',
    "request_notes" TEXT,
    "evaluation_notes" TEXT,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_id" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "evaluated_by_id" TEXT,
    "approved_by_id" TEXT,
    "evaluated_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_center_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_center_return_requests_sale_id_key" ON "service_center_return_requests"("sale_id");

-- CreateIndex
CREATE INDEX "service_center_return_requests_tenant_id_status_idx" ON "service_center_return_requests"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "service_center_sales_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_evaluated_by_id_fkey" FOREIGN KEY ("evaluated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_return_requests" ADD CONSTRAINT "service_center_return_requests_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
