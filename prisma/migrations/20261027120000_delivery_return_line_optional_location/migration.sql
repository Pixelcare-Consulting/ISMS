-- Inventory comes from SAP, and dispatch can take a serial straight from SAP's warehouse
-- placement with no ISMS location. Returning such a unit has no location to go back to.
ALTER TABLE "delivery_return_lines" ALTER COLUMN "warehouse_location_to_id" DROP NOT NULL;
