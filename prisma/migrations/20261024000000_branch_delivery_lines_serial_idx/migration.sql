-- Stock units: a unit counts as STK once a DR (DR# + DR date) covers its serial, so the
-- grouped counts look up delivery lines by serial. The only existing index leads on
-- delivery_id.
CREATE INDEX "branch_delivery_lines_serial_number_id_idx" ON "branch_delivery_lines"("serial_number_id");
