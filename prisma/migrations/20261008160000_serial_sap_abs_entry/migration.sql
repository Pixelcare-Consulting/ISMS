-- Remember OSRN.AbsEntry on each serial so a later on-hand read can target it.

ALTER TABLE "serial_numbers" ADD COLUMN "sap_abs_entry" INTEGER;
