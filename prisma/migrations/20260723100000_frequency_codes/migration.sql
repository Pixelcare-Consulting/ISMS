-- Reusable frequency-code lookup; branch schedules reference it via frequency_code_id.

-- 1. New reusable frequency-code lookup table.
CREATE TABLE "frequency_codes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "frequency" "DeliveryFrequency" NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "frequency_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "frequency_codes_tenant_id_code_key" ON "frequency_codes"("tenant_id", "code");
CREATE INDEX "frequency_codes_tenant_id_idx" ON "frequency_codes"("tenant_id");

ALTER TABLE "frequency_codes"
  ADD CONSTRAINT "frequency_codes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Rework branch_delivery_schedules to reference a frequency code.
--    Existing rows carried the old f_code/frequency columns; they are cleared
--    here and rebuilt by the schedules seed (mapped to frequency codes).
DELETE FROM "branch_delivery_schedules";

ALTER TABLE "branch_delivery_schedules" DROP COLUMN "f_code";
ALTER TABLE "branch_delivery_schedules" DROP COLUMN "frequency";
ALTER TABLE "branch_delivery_schedules" ADD COLUMN "frequency_code_id" TEXT NOT NULL;

CREATE INDEX "branch_delivery_schedules_frequency_code_id_idx"
  ON "branch_delivery_schedules"("frequency_code_id");

ALTER TABLE "branch_delivery_schedules"
  ADD CONSTRAINT "branch_delivery_schedules_frequency_code_id_fkey"
  FOREIGN KEY ("frequency_code_id") REFERENCES "frequency_codes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
