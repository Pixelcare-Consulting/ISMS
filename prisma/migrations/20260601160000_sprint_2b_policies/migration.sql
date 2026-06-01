-- Sprint 2b: policy view access, review events, attachments
ALTER TABLE "policies" ADD COLUMN "reviewer_id" TEXT;

ALTER TABLE "policies" ADD CONSTRAINT "policies_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "policy_review_events" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_review_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "policy_attachments" (
    "id" TEXT NOT NULL,
    "policy_version_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "policy_review_events_policy_id_created_at_idx" ON "policy_review_events"("policy_id", "created_at");
CREATE INDEX "policy_attachments_policy_version_id_idx" ON "policy_attachments"("policy_version_id");

ALTER TABLE "policy_review_events" ADD CONSTRAINT "policy_review_events_policy_id_fkey"
  FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "policy_review_events" ADD CONSTRAINT "policy_review_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "policy_attachments" ADD CONSTRAINT "policy_attachments_policy_version_id_fkey"
  FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "policy_attachments" ADD CONSTRAINT "policy_attachments_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
