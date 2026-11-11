-- A warehouse's default location, pre-filled when receiving pull-outs.
ALTER TABLE "warehouse_locations" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Prisma cannot express a partial unique index, so it lives only here.
CREATE UNIQUE INDEX "warehouse_locations_default_uq"
  ON "warehouse_locations" ("warehouse_id")
  WHERE "is_default";
