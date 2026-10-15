-- Models carry a category like the other master-data lookups; set from the edit sheet or the import.

ALTER TABLE "product_models" ADD COLUMN "category_id" TEXT;

CREATE INDEX "product_models_category_id_idx" ON "product_models"("category_id");

ALTER TABLE "product_models" ADD CONSTRAINT "product_models_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
