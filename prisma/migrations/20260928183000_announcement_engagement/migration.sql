-- Announcement engagement: reads, likes, comments (Dashboard Overview feed)

CREATE TABLE IF NOT EXISTS "announcement_reads" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "announcement_likes" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_likes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "announcement_comments" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "announcement_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "announcement_reads_announcement_id_user_id_key"
  ON "announcement_reads"("announcement_id", "user_id");
CREATE INDEX IF NOT EXISTS "announcement_reads_announcement_id_read_at_idx"
  ON "announcement_reads"("announcement_id", "read_at");
CREATE INDEX IF NOT EXISTS "announcement_reads_user_id_idx"
  ON "announcement_reads"("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "announcement_likes_announcement_id_user_id_key"
  ON "announcement_likes"("announcement_id", "user_id");
CREATE INDEX IF NOT EXISTS "announcement_likes_announcement_id_created_at_idx"
  ON "announcement_likes"("announcement_id", "created_at");
CREATE INDEX IF NOT EXISTS "announcement_likes_user_id_idx"
  ON "announcement_likes"("user_id");

CREATE INDEX IF NOT EXISTS "announcement_comments_announcement_id_created_at_idx"
  ON "announcement_comments"("announcement_id", "created_at");
CREATE INDEX IF NOT EXISTS "announcement_comments_user_id_idx"
  ON "announcement_comments"("user_id");

DO $$ BEGIN
  ALTER TABLE "announcement_reads"
    ADD CONSTRAINT "announcement_reads_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcement_reads"
    ADD CONSTRAINT "announcement_reads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcement_likes"
    ADD CONSTRAINT "announcement_likes_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcement_likes"
    ADD CONSTRAINT "announcement_likes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcement_comments"
    ADD CONSTRAINT "announcement_comments_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcement_comments"
    ADD CONSTRAINT "announcement_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
