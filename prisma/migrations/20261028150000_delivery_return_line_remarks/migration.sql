-- Per-unit remarks on a reject request (e.g. "screen cracked"); defaults to the request remarks.
ALTER TABLE "delivery_return_lines" ADD COLUMN "remarks" TEXT;
