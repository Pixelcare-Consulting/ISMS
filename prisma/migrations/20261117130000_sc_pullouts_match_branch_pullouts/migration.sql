-- Service center pull-outs now work like branch pull-outs: each unit keeps its prior STK or
-- DEF, a Team Lead decision, a reason, remarks, and the same checklist (classification,
-- problem description, packing condition, accessory completeness). The header gains the
-- logistics fields and attachments. The flow ends at Send (DIT); nothing posts to SAP.

◇ injected env (17) from .env.local // tip: ◈ secrets for agents [www.dotenvx.com]
-- AlterTable
ALTER TABLE "service_center_pullouts" ADD COLUMN     "actual_scheduled_date" TIMESTAMP(3),
ADD COLUMN     "courier_name" TEXT,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "scheduled_by_id" TEXT;

-- AlterTable
ALTER TABLE "service_center_pullout_details" ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "decided_by_id" TEXT,
ADD COLUMN     "decision" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "prior_status_code_id" TEXT,
ADD COLUMN     "reason_code_id" TEXT,
ADD COLUMN     "remarks" TEXT;

-- AlterTable
ALTER TABLE "service_center_pullout_approval_levels" ADD COLUMN     "rejected_by_id" TEXT;

-- CreateTable
CREATE TABLE "service_center_pullout_detail_classifications" (
    "id" TEXT NOT NULL,
    "pullout_detail_id" TEXT NOT NULL,
    "pullout_classification_id" TEXT NOT NULL,

    CONSTRAINT "service_center_pullout_detail_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_center_pullout_detail_problem_descriptions" (
    "id" TEXT NOT NULL,
    "pullout_detail_id" TEXT NOT NULL,
    "problem_description_id" TEXT NOT NULL,

    CONSTRAINT "service_center_pullout_detail_problem_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_center_pullout_detail_packing_conditions" (
    "id" TEXT NOT NULL,
    "pullout_detail_id" TEXT NOT NULL,
    "unit_packing_condition_id" TEXT NOT NULL,

    CONSTRAINT "service_center_pullout_detail_packing_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_center_pullout_detail_accessory_completeness" (
    "id" TEXT NOT NULL,
    "pullout_detail_id" TEXT NOT NULL,
    "accessory_completeness_id" TEXT NOT NULL,

    CONSTRAINT "service_center_pullout_detail_accessory_completeness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_center_pullout_attachments" (
    "id" TEXT NOT NULL,
    "pullout_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_center_pullout_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_center_pullout_detail_classifications_pullout_class_idx" ON "service_center_pullout_detail_classifications"("pullout_classification_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_center_pullout_detail_classifications_pullout_detai_key" ON "service_center_pullout_detail_classifications"("pullout_detail_id", "pullout_classification_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_detail_problem_descriptions_problem__idx" ON "service_center_pullout_detail_problem_descriptions"("problem_description_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_center_pullout_detail_problem_descriptions_pullout__key" ON "service_center_pullout_detail_problem_descriptions"("pullout_detail_id", "problem_description_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_detail_packing_conditions_unit_packi_idx" ON "service_center_pullout_detail_packing_conditions"("unit_packing_condition_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_center_pullout_detail_packing_conditions_pullout_de_key" ON "service_center_pullout_detail_packing_conditions"("pullout_detail_id", "unit_packing_condition_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_detail_accessory_completeness_access_idx" ON "service_center_pullout_detail_accessory_completeness"("accessory_completeness_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_center_pullout_detail_accessory_completeness_pullou_key" ON "service_center_pullout_detail_accessory_completeness"("pullout_detail_id", "accessory_completeness_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_attachments_pullout_id_idx" ON "service_center_pullout_attachments"("pullout_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_attachments_uploaded_by_id_idx" ON "service_center_pullout_attachments"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "service_center_pullouts_status_code_id_idx" ON "service_center_pullouts"("status_code_id");

-- CreateIndex
CREATE INDEX "service_center_pullouts_scheduled_by_id_idx" ON "service_center_pullouts"("scheduled_by_id");

-- CreateIndex
CREATE INDEX "service_center_pullouts_created_by_id_idx" ON "service_center_pullouts"("created_by_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_details_serial_number_id_idx" ON "service_center_pullout_details"("serial_number_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_details_prior_status_code_id_idx" ON "service_center_pullout_details"("prior_status_code_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_details_decided_by_id_idx" ON "service_center_pullout_details"("decided_by_id");

-- CreateIndex
CREATE INDEX "service_center_pullout_details_reason_code_id_idx" ON "service_center_pullout_details"("reason_code_id");

-- AddForeignKey
ALTER TABLE "service_center_pullouts" ADD CONSTRAINT "service_center_pullouts_scheduled_by_id_fkey" FOREIGN KEY ("scheduled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullouts" ADD CONSTRAINT "service_center_pullouts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_details" ADD CONSTRAINT "service_center_pullout_details_prior_status_code_id_fkey" FOREIGN KEY ("prior_status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_details" ADD CONSTRAINT "service_center_pullout_details_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_details" ADD CONSTRAINT "service_center_pullout_details_reason_code_id_fkey" FOREIGN KEY ("reason_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_detail_classifications" ADD CONSTRAINT "service_center_pullout_detail_classifications_pullout_deta_fkey" FOREIGN KEY ("pullout_detail_id") REFERENCES "service_center_pullout_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_detail_classifications" ADD CONSTRAINT "service_center_pullout_detail_classifications_pullout_clas_fkey" FOREIGN KEY ("pullout_classification_id") REFERENCES "pullout_classifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_detail_problem_descriptions" ADD CONSTRAINT "service_center_pullout_detail_problem_descriptions_pullout_fkey" FOREIGN KEY ("pullout_detail_id") REFERENCES "service_center_pullout_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_detail_problem_descriptions" ADD CONSTRAINT "service_center_pullout_detail_problem_descriptions_problem_fkey" FOREIGN KEY ("problem_description_id") REFERENCES "problem_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_detail_packing_conditions" ADD CONSTRAINT "service_center_pullout_detail_packing_conditions_pullout_d_fkey" FOREIGN KEY ("pullout_detail_id") REFERENCES "service_center_pullout_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_detail_packing_conditions" ADD CONSTRAINT "service_center_pullout_detail_packing_conditions_unit_pack_fkey" FOREIGN KEY ("unit_packing_condition_id") REFERENCES "unit_packing_conditions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_detail_accessory_completeness" ADD CONSTRAINT "service_center_pullout_detail_accessory_completeness_pullo_fkey" FOREIGN KEY ("pullout_detail_id") REFERENCES "service_center_pullout_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_detail_accessory_completeness" ADD CONSTRAINT "service_center_pullout_detail_accessory_completeness_acces_fkey" FOREIGN KEY ("accessory_completeness_id") REFERENCES "accessory_completeness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_attachments" ADD CONSTRAINT "service_center_pullout_attachments_pullout_id_fkey" FOREIGN KEY ("pullout_id") REFERENCES "service_center_pullouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_center_pullout_attachments" ADD CONSTRAINT "service_center_pullout_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Pull-outs made before this change could only reserve STK units, so STK is their prior
-- status. A unit on a pull-out the Team Lead already approved counts as accepted.
UPDATE "service_center_pullout_details" AS detail
SET "prior_status_code_id" = stk."id"
FROM "service_center_pullouts" AS pullout
INNER JOIN "reason_status_codes" AS stk
  ON stk."tenant_id" = pullout."tenant_id"
  AND stk."code" = 'STK'
INNER JOIN "reason_statuses" AS category
  ON category."id" = stk."reason_status_id"
  AND category."category" = 'inventory_system'
WHERE detail."pullout_id" = pullout."id"
  AND detail."prior_status_code_id" IS NULL;

UPDATE "service_center_pullout_details" AS detail
SET "decision" = 'accepted'
FROM "service_center_pullouts" AS pullout
INNER JOIN "reason_status_codes" AS status
  ON status."id" = pullout."status_code_id"
WHERE detail."pullout_id" = pullout."id"
  AND status."code" NOT IN ('pending_tl', 'requested', 'cancelled');
