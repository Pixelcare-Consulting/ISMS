import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataPaymentTypesPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("paymentType");

  return (
    <div className="space-y-4">
      <SectionPageLead>Payment type lookup for sales transactions.</SectionPageLead>
      <LookupTable entity="paymentType" rows={rows} />
    </div>
  );
}
