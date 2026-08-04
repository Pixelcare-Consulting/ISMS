-- Add Daily and Three times a month cadences to DeliveryFrequency.
ALTER TYPE "DeliveryFrequency" ADD VALUE 'daily';
ALTER TYPE "DeliveryFrequency" ADD VALUE 'thrice_monthly';
