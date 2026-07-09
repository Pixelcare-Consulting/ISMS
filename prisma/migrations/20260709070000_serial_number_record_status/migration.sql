-- AlterTable
ALTER TABLE "serial_numbers" ADD COLUMN     "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active';
