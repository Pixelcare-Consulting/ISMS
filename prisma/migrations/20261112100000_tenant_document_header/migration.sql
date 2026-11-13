-- Address and contact lines printed beside the company logo on pull-out, transfer,
-- release slip and delivery receipt print-outs. Nullable: no header until set.
ALTER TABLE "tenants" ADD COLUMN "document_header" TEXT;
