-- Per-order mode of payment: overrides the dealer's for one order (ITR vs SO).
-- Null keeps following the dealer.

-- AlterTable
ALTER TABLE "branch_orders" ADD COLUMN "mode_of_payment_id" TEXT;

-- AddForeignKey
ALTER TABLE "branch_orders" ADD CONSTRAINT "branch_orders_mode_of_payment_id_fkey" FOREIGN KEY ("mode_of_payment_id") REFERENCES "mode_of_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
