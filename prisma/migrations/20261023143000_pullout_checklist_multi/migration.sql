-- Several checklist choices per pull-out line. Existing single choices are copied, then the old columns are dropped.

-- CreateTable
CREATE TABLE "branch_pullout_line_classifications" (
    "id" TEXT NOT NULL,
    "pullout_line_id" TEXT NOT NULL,
    "pullout_classification_id" TEXT NOT NULL,

    CONSTRAINT "branch_pullout_line_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_pullout_line_packing_conditions" (
    "id" TEXT NOT NULL,
    "pullout_line_id" TEXT NOT NULL,
    "unit_packing_condition_id" TEXT NOT NULL,

    CONSTRAINT "branch_pullout_line_packing_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_pullout_line_accessory_completeness" (
    "id" TEXT NOT NULL,
    "pullout_line_id" TEXT NOT NULL,
    "accessory_completeness_id" TEXT NOT NULL,

    CONSTRAINT "branch_pullout_line_accessory_completeness_pkey" PRIMARY KEY ("id")
);

-- Copy the previous one-value choices before those columns go away.
INSERT INTO "branch_pullout_line_classifications" ("id", "pullout_line_id", "pullout_classification_id")
SELECT gen_random_uuid()::text, "id", "pullout_classification_id"
FROM "branch_pullout_lines"
WHERE "pullout_classification_id" IS NOT NULL;

INSERT INTO "branch_pullout_line_packing_conditions" ("id", "pullout_line_id", "unit_packing_condition_id")
SELECT gen_random_uuid()::text, "id", "unit_packing_condition_id"
FROM "branch_pullout_lines"
WHERE "unit_packing_condition_id" IS NOT NULL;

INSERT INTO "branch_pullout_line_accessory_completeness" ("id", "pullout_line_id", "accessory_completeness_id")
SELECT gen_random_uuid()::text, "id", "accessory_completeness_id"
FROM "branch_pullout_lines"
WHERE "accessory_completeness_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "branch_pullout_line_classifications_pullout_classification__idx" ON "branch_pullout_line_classifications"("pullout_classification_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_pullout_line_classifications_pullout_line_id_pullout_key" ON "branch_pullout_line_classifications"("pullout_line_id", "pullout_classification_id");

-- CreateIndex
CREATE INDEX "branch_pullout_line_packing_conditions_unit_packing_conditi_idx" ON "branch_pullout_line_packing_conditions"("unit_packing_condition_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_pullout_line_packing_conditions_pullout_line_id_unit_key" ON "branch_pullout_line_packing_conditions"("pullout_line_id", "unit_packing_condition_id");

-- CreateIndex
CREATE INDEX "branch_pullout_line_accessory_completeness_accessory_comple_idx" ON "branch_pullout_line_accessory_completeness"("accessory_completeness_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_pullout_line_accessory_completeness_pullout_line_id__key" ON "branch_pullout_line_accessory_completeness"("pullout_line_id", "accessory_completeness_id");

-- AddForeignKey
ALTER TABLE "branch_pullout_line_classifications" ADD CONSTRAINT "branch_pullout_line_classifications_pullout_line_id_fkey" FOREIGN KEY ("pullout_line_id") REFERENCES "branch_pullout_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_line_classifications" ADD CONSTRAINT "branch_pullout_line_classifications_pullout_classification_fkey" FOREIGN KEY ("pullout_classification_id") REFERENCES "pullout_classifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_line_packing_conditions" ADD CONSTRAINT "branch_pullout_line_packing_conditions_pullout_line_id_fkey" FOREIGN KEY ("pullout_line_id") REFERENCES "branch_pullout_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_line_packing_conditions" ADD CONSTRAINT "branch_pullout_line_packing_conditions_unit_packing_condit_fkey" FOREIGN KEY ("unit_packing_condition_id") REFERENCES "unit_packing_conditions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_line_accessory_completeness" ADD CONSTRAINT "branch_pullout_line_accessory_completeness_pullout_line_id_fkey" FOREIGN KEY ("pullout_line_id") REFERENCES "branch_pullout_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_line_accessory_completeness" ADD CONSTRAINT "branch_pullout_line_accessory_completeness_accessory_compl_fkey" FOREIGN KEY ("accessory_completeness_id") REFERENCES "accessory_completeness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "branch_pullout_lines" DROP CONSTRAINT "branch_pullout_lines_accessory_completeness_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_pullout_lines" DROP CONSTRAINT "branch_pullout_lines_pullout_classification_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_pullout_lines" DROP CONSTRAINT "branch_pullout_lines_unit_packing_condition_id_fkey";

-- DropIndex
DROP INDEX "branch_pullout_lines_accessory_completeness_id_idx";

-- DropIndex
DROP INDEX "branch_pullout_lines_pullout_classification_id_idx";

-- DropIndex
DROP INDEX "branch_pullout_lines_unit_packing_condition_id_idx";

-- AlterTable
ALTER TABLE "branch_pullout_lines" DROP COLUMN "accessory_completeness_id",
DROP COLUMN "pullout_classification_id",
DROP COLUMN "unit_packing_condition_id";
