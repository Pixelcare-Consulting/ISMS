-- Remember which serials SAP still has on hand. Does not write stock units or planogram quantities.

ALTER TABLE "serial_numbers" ADD COLUMN "sap_on_hand" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "serial_numbers" ADD COLUMN "sap_on_hand_synced_at" TIMESTAMP(3);
