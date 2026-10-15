-- Process III.A hook: partial delivery return → SAP Inventory Transfer (OWTR)
-- Document naming per docs/sapb1_mapping_table_Update_gilbert_v2.pdf

ALTER TYPE "SapIntegrationJobType" ADD VALUE IF NOT EXISTS 'delivery_partial_return';
