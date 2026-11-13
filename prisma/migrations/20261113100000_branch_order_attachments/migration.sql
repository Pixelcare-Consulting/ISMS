-- Files the requestor attaches to a branch order on Create Order. The file itself is in object storage.
CREATE TABLE "branch_order_attachments" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branch_order_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "branch_order_attachments_order_id_idx" ON "branch_order_attachments"("order_id");

CREATE INDEX "branch_order_attachments_uploaded_by_id_idx" ON "branch_order_attachments"("uploaded_by_id");

ALTER TABLE "branch_order_attachments"
  ADD CONSTRAINT "branch_order_attachments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "branch_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_order_attachments"
  ADD CONSTRAINT "branch_order_attachments_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
