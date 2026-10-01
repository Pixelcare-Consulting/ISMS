-- P-Count B1 alignment: session posting status + inventory_posting job type

ALTER TYPE "StockCountSessionStatus" ADD VALUE IF NOT EXISTS 'posting';

ALTER TYPE "SapIntegrationJobType" ADD VALUE IF NOT EXISTS 'inventory_posting';
