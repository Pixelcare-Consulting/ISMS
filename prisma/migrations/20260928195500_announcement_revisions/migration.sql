-- Announcement edit history (previous title+body snapshots)

CREATE TABLE IF NOT EXISTS "announcement_revisions" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "edited_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "announcement_revisions_announcement_id_created_at_idx"
  ON "announcement_revisions"("announcement_id", "created_at");
CREATE INDEX IF NOT EXISTS "announcement_revisions_edited_by_id_idx"
  ON "announcement_revisions"("edited_by_id");

DO $$ BEGIN
  ALTER TABLE "announcement_revisions"
    ADD CONSTRAINT "announcement_revisions_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcement_revisions"
    ADD CONSTRAINT "announcement_revisions_edited_by_id_fkey"
    FOREIGN KEY ("edited_by_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
