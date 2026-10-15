-- Remember the warehouse from the on-hand read so a serial can show its branch.

ALTER TABLE "serial_numbers" ADD COLUMN "sap_whs_code" TEXT;
