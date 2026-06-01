-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_action_idx" ON "audit_logs"("tenant_id", "action");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_type_idx" ON "audit_logs"("tenant_id", "entity_type");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
