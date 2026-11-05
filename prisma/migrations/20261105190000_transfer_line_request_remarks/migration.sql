-- Requester's remark per serial on a branch transfer. Kept apart from "remarks", which holds the
-- receiving branch's rejection reason and is rewritten when the serial is accepted or rejected.
ALTER TABLE "branch_transfer_lines" ADD COLUMN "request_remarks" TEXT;
