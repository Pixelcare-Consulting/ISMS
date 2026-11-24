-- Sale facts and returned/replaced serials copied onto a serial history row
-- at the moment it is written. Nullable so existing rows stay valid.
ALTER TABLE "serial_number_histories" ADD COLUMN "context" JSONB;
