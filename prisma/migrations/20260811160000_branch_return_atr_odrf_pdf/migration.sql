-- ATR/ODRF PDF storage path on branch return requests

ALTER TABLE "branch_return_requests"
  ADD COLUMN IF NOT EXISTS "atr_odrf_pdf_path" TEXT;
