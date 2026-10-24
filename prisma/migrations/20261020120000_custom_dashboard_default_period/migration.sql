-- CreateEnum
CREATE TYPE "CustomDashboardPeriod" AS ENUM ('TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR');

-- AlterTable
ALTER TABLE "custom_dashboards" ADD COLUMN "default_period" "CustomDashboardPeriod" NOT NULL DEFAULT 'LAST_30_DAYS';
