-- Service Return / Replacement (Process V-b): the chosen service center inspects the unit
-- and finishes the request. The returned unit goes into SC stock (STK/DEF); a replacement
-- comes from SC STK, or from a special SC order when the SC has none.

-- AlterEnum
ALTER TYPE "ReturnRequestStatus" ADD VALUE 'pending_sc';
ALTER TYPE "ReturnRequestStatus" ADD VALUE 'awaiting_stock';

-- AlterTable
ALTER TABLE "branch_return_requests" ADD COLUMN     "held_serial_number_id" TEXT,
ADD COLUMN     "inspected_at" TIMESTAMP(3),
ADD COLUMN     "inspected_by_id" TEXT,
ADD COLUMN     "special_order_id" TEXT;

-- AlterTable
ALTER TABLE "sales_replacements" ADD COLUMN     "replacement_service_center_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "branch_return_requests_special_order_id_key" ON "branch_return_requests"("special_order_id");

-- CreateIndex
CREATE INDEX "branch_return_requests_tenant_id_service_center_id_status_idx" ON "branch_return_requests"("tenant_id", "service_center_id", "status");

-- CreateIndex
CREATE INDEX "branch_return_requests_inspected_by_id_idx" ON "branch_return_requests"("inspected_by_id");

-- CreateIndex
CREATE INDEX "branch_return_requests_held_serial_number_id_idx" ON "branch_return_requests"("held_serial_number_id");

-- CreateIndex
CREATE INDEX "sales_replacements_replacement_service_center_id_idx" ON "sales_replacements"("replacement_service_center_id");

-- AddForeignKey
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_special_order_id_fkey" FOREIGN KEY ("special_order_id") REFERENCES "service_center_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_held_serial_number_id_fkey" FOREIGN KEY ("held_serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_replacements" ADD CONSTRAINT "sales_replacements_replacement_service_center_id_fkey" FOREIGN KEY ("replacement_service_center_id") REFERENCES "service_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reserve ODRF (ODRF): a sold unit sent to a service center for a Service Return or
-- Replacement. Added to each tenant inventory status group that does not have it yet.
INSERT INTO "reason_status_codes" (
  "id", "tenant_id", "reason_status_id", "name", "code", "color", "sort_order", "is_system", "updated_at"
)
SELECT gen_random_uuid()::text, rs.tenant_id, rs.id, 'Reserve ODRF', 'ODRF', 'orange', 12, true, NOW()
FROM "reason_statuses" rs
WHERE rs.category = 'inventory_system'
  AND NOT EXISTS (
    SELECT 1 FROM "reason_status_codes" rsc
    WHERE rsc.reason_status_id = rs.id AND rsc.code = 'ODRF'
  );

-- Sales & ATR steps for the service center part of a service return.
INSERT INTO "reason_status_codes" (
  "id", "tenant_id", "reason_status_id", "name", "code", "color", "sort_order", "is_system", "updated_at"
)
SELECT gen_random_uuid()::text, rs.tenant_id, rs.id, step.name, step.code, step.color, step.sort_order, true, NOW()
FROM "reason_statuses" rs
CROSS JOIN (
  VALUES
    ('Pending SC', 'pending_sc', 'amber', 9),
    ('Awaiting Stock', 'awaiting_stock', 'sky', 10)
) AS step(name, code, color, sort_order)
WHERE rs.category = 'sales_atr'
  AND NOT EXISTS (
    SELECT 1 FROM "reason_status_codes" rsc
    WHERE rsc.reason_status_id = rs.id AND rsc.code = step.code
  );

-- Service center staff finish these requests. Every role that can encode service center
-- sales gets the new permission.
INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'service_centers.returns.process', 'Process service center returns and replacements', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, granted."role_id", process."id", NOW()
FROM (
  SELECT DISTINCT existing."role_id"
  FROM "role_permissions" AS existing
  INNER JOIN "permissions" AS gate
    ON gate."id" = existing."permission_id"
    AND gate."slug" = 'service_centers.sales.create'
) AS granted
CROSS JOIN "permissions" AS process
WHERE process."slug" = 'service_centers.returns.process'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
