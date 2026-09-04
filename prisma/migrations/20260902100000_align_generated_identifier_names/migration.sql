-- Align object names Postgres truncated at the 63-char identifier limit with the
-- names Prisma derives from prisma/schema.prisma. Purely cosmetic: same columns,
-- same constraints, same uniqueness -- but without this every future
-- `prisma migrate dev` keeps proposing these renames as drift.
-- Guarded so re-running against an already-aligned database is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_center_sales_transactions_customer_delivery_method_id_f'
      AND conrelid = 'public."service_center_sales_transactions"'::regclass
  ) THEN
    ALTER TABLE "service_center_sales_transactions" RENAME CONSTRAINT "service_center_sales_transactions_customer_delivery_method_id_f" TO "service_center_sales_transactions_customer_delivery_method_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_center_sales_transactions_service_center_location_id_fk'
      AND conrelid = 'public."service_center_sales_transactions"'::regclass
  ) THEN
    ALTER TABLE "service_center_sales_transactions" RENAME CONSTRAINT "service_center_sales_transactions_service_center_location_id_fk" TO "service_center_sales_transactions_service_center_location__fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'branch_sales_transactions_tenant_id_branch_id_transaction_no_ke' AND c.relkind = 'i'
  ) THEN
    ALTER INDEX "branch_sales_transactions_tenant_id_branch_id_transaction_no_ke" RENAME TO "branch_sales_transactions_tenant_id_branch_id_transaction_n_key";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'serial_number_histories_tenant_id_serial_number_id_created_at_i' AND c.relkind = 'i'
  ) THEN
    ALTER INDEX "serial_number_histories_tenant_id_serial_number_id_created_at_i" RENAME TO "serial_number_histories_tenant_id_serial_number_id_created__idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'service_center_inventories_service_center_location_id_serial_nu' AND c.relkind = 'i'
  ) THEN
    ALTER INDEX "service_center_inventories_service_center_location_id_serial_nu" RENAME TO "service_center_inventories_service_center_location_id_seria_key";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'service_center_sales_transactions_tenant_id_service_center_id_i' AND c.relkind = 'i'
  ) THEN
    ALTER INDEX "service_center_sales_transactions_tenant_id_service_center_id_i" RENAME TO "service_center_sales_transactions_tenant_id_service_center__idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'warehouse_inventories_warehouse_location_id_serial_number_id_ke' AND c.relkind = 'i'
  ) THEN
    ALTER INDEX "warehouse_inventories_warehouse_location_id_serial_number_id_ke" RENAME TO "warehouse_inventories_warehouse_location_id_serial_number_i_key";
  END IF;
END $$;
