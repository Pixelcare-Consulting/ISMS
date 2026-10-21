-- One current placement per serial.
-- This migration does not delete, merge, or choose a winner.
-- If any check below matches, the migration stops and leaves the old indexes in place.

DO $$
DECLARE
  branch_duplicate integer;
  warehouse_duplicate integer;
  service_center_duplicate integer;
  cross_table integer;
BEGIN
  SELECT COUNT(*) INTO branch_duplicate FROM (
    SELECT serial_number_id
    FROM branch_inventories
    GROUP BY serial_number_id
    HAVING COUNT(*) > 1
  ) conflicts;

  SELECT COUNT(*) INTO warehouse_duplicate FROM (
    SELECT serial_number_id
    FROM warehouse_inventories
    GROUP BY serial_number_id
    HAVING COUNT(*) > 1
  ) conflicts;

  SELECT COUNT(*) INTO service_center_duplicate FROM (
    SELECT serial_number_id
    FROM service_center_inventories
    GROUP BY serial_number_id
    HAVING COUNT(*) > 1
  ) conflicts;

  SELECT COUNT(*) INTO cross_table FROM (
    SELECT serial_number_id
    FROM (
      SELECT serial_number_id, 'branch'::text AS source FROM branch_inventories
      UNION
      SELECT serial_number_id, 'warehouse'::text FROM warehouse_inventories
      UNION
      SELECT serial_number_id, 'service_center'::text FROM service_center_inventories
    ) sources
    GROUP BY serial_number_id
    HAVING COUNT(*) > 1
  ) conflicts;

  IF branch_duplicate > 0
     OR warehouse_duplicate > 0
     OR service_center_duplicate > 0
     OR cross_table > 0 THEN
    RAISE EXCEPTION
      'inventory integrity preflight failed: branch_duplicate=% warehouse_duplicate=% service_center_duplicate=% cross_table=%',
      branch_duplicate,
      warehouse_duplicate,
      service_center_duplicate,
      cross_table;
  END IF;
END $$;

-- DropIndex
DROP INDEX "branch_inventories_branch_id_serial_number_id_key";

-- DropIndex
DROP INDEX "service_center_inventories_service_center_location_id_seria_key";

-- DropIndex
DROP INDEX "warehouse_inventories_warehouse_location_id_serial_number_i_key";

-- CreateIndex
CREATE INDEX "branch_inventories_branch_id_serial_number_id_idx" ON "branch_inventories"("branch_id", "serial_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_inventories_serial_number_id_key" ON "branch_inventories"("serial_number_id");

-- CreateIndex
CREATE INDEX "service_center_inventories_service_center_location_id_seria_idx" ON "service_center_inventories"("service_center_location_id", "serial_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_center_inventories_serial_number_id_key" ON "service_center_inventories"("serial_number_id");

-- CreateIndex
CREATE INDEX "warehouse_inventories_warehouse_location_id_serial_number_i_idx" ON "warehouse_inventories"("warehouse_location_id", "serial_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_inventories_serial_number_id_key" ON "warehouse_inventories"("serial_number_id");

-- A move may delete one placement and insert another in the same transaction.
-- Commit fails when more than one current placement remains.
CREATE OR REPLACE FUNCTION assert_single_serial_placement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  serial_id text;
  placement_count integer;
BEGIN
  serial_id := COALESCE(NEW.serial_number_id, OLD.serial_number_id);
  SELECT
    (SELECT COUNT(*) FROM branch_inventories WHERE serial_number_id = serial_id)
    + (SELECT COUNT(*) FROM warehouse_inventories WHERE serial_number_id = serial_id)
    + (SELECT COUNT(*) FROM service_center_inventories WHERE serial_number_id = serial_id)
  INTO placement_count;

  IF placement_count > 1 THEN
    RAISE EXCEPTION 'serial % has % current placements; only one is allowed', serial_id, placement_count;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER serial_placement_branch_check
AFTER INSERT OR UPDATE OR DELETE ON branch_inventories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_single_serial_placement();

CREATE CONSTRAINT TRIGGER serial_placement_warehouse_check
AFTER INSERT OR UPDATE OR DELETE ON warehouse_inventories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_single_serial_placement();

CREATE CONSTRAINT TRIGGER serial_placement_service_center_check
AFTER INSERT OR UPDATE OR DELETE ON service_center_inventories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_single_serial_placement();
