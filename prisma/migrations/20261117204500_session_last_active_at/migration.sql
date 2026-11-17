-- Last click, key, or scroll. Idle sign-out reads this instead of updated_at,
-- which also changes when the session row is touched for other reasons.
ALTER TABLE "sessions"
ADD COLUMN "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
