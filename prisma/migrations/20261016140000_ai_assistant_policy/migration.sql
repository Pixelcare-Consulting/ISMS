-- Tenant assistant switch. No backfill: missing row means the assistant stays off.

CREATE TABLE "ai_assistant_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_requests_per_user" INTEGER NOT NULL DEFAULT 30,
    "window_seconds" INTEGER NOT NULL DEFAULT 600,
    "max_output_tokens" INTEGER NOT NULL DEFAULT 2048,
    "max_tool_steps" INTEGER NOT NULL DEFAULT 5,
    "request_timeout_ms" INTEGER NOT NULL DEFAULT 60000,
    "max_requests_per_tenant" INTEGER NOT NULL DEFAULT 300,
    "max_user_concurrency" INTEGER NOT NULL DEFAULT 2,
    "max_tenant_concurrency" INTEGER NOT NULL DEFAULT 20,
    "max_context_messages" INTEGER NOT NULL DEFAULT 24,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_assistant_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_assistant_policies_tenant_id_key" ON "ai_assistant_policies"("tenant_id");

ALTER TABLE "ai_assistant_policies"
ADD CONSTRAINT "ai_assistant_policies_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_replenishment_proposals" ADD COLUMN "line_hash" TEXT;

CREATE TABLE "ai_replenishment_confirmations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "line_hash" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_replenishment_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_replenishment_confirmations_token_hash_key" ON "ai_replenishment_confirmations"("token_hash");
CREATE INDEX "ai_replenishment_confirmations_tenant_id_user_id_proposal_id_idx" ON "ai_replenishment_confirmations"("tenant_id", "user_id", "proposal_id");

ALTER TABLE "ai_replenishment_confirmations"
ADD CONSTRAINT "ai_replenishment_confirmations_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_replenishment_confirmations"
ADD CONSTRAINT "ai_replenishment_confirmations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_replenishment_confirmations"
ADD CONSTRAINT "ai_replenishment_confirmations_proposal_id_fkey"
FOREIGN KEY ("proposal_id") REFERENCES "ai_replenishment_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
