-- Add Sales & ATR status settings category
ALTER TYPE "ReasonStatusCategory" ADD VALUE IF NOT EXISTS 'sales_atr';
