-- A delivery can now have several open reject requests (one per reject at receipt).
-- A unit is still on at most one open request: the service checks it under the serial locks.
DROP INDEX IF EXISTS "delivery_return_open_uq";
