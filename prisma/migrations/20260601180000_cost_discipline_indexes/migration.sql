-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_user_id_idx" ON "audit_logs"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "branch_sales_transactions_tenant_id_atr_status_idx" ON "branch_sales_transactions"("tenant_id", "atr_status");

-- CreateIndex
CREATE INDEX "product_models_brand_id_idx" ON "product_models"("brand_id");

-- CreateIndex
CREATE INDEX "serial_numbers_model_id_idx" ON "serial_numbers"("model_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");
