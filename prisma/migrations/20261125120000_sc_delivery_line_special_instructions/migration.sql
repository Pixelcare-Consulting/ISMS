-- SC delivery lines keep the SAP DR line's Special Instructions (U_Special_Instructions),
-- read when Check SAP adds the DR. SC Returns shows it beside the serial when picking a
-- Service Replacement unit ({SN}-{special instruction}).
--
-- Adds a nullable column: no data is changed. Older deliveries stay blank.

ALTER TABLE "service_center_delivery_lines" ADD COLUMN IF NOT EXISTS "sap_special_instructions" TEXT;
