-- Announcement comment edit history (previous body snapshots)

CREATE TABLE IF NOT EXISTS "announcement_comment_revisions" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "edited_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_comment_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "announcement_comment_revisions_comment_id_created_at_idx"
  ON "announcement_comment_revisions"("comment_id", "created_at");
CREATE INDEX IF NOT EXISTS "announcement_comment_revisions_edited_by_id_idx"
  ON "announcement_comment_revisions"("edited_by_id");

DO $$ BEGIN
  ALTER TABLE "announcement_comment_revisions"
    ADD CONSTRAINT "announcement_comment_revisions_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "announcement_comments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcement_comment_revisions"
    ADD CONSTRAINT "announcement_comment_revisions_edited_by_id_fkey"
    FOREIGN KEY ("edited_by_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
