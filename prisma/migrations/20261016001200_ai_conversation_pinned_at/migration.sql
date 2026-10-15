-- Additive: pin Pixelcare AI conversations to the top of the list
ALTER TABLE "ai_conversations" ADD COLUMN "pinned_at" TIMESTAMP(3);

CREATE INDEX "ai_conversations_tenant_id_user_id_pinned_at_idx" ON "ai_conversations"("tenant_id", "user_id", "pinned_at");
