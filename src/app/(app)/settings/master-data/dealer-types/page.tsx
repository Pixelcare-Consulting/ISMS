import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataDealerTypesPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("dealerType");

  return (
    <div className="space-y-4">
      <SectionPageLead>Dealer type lookup for dealer classification.</SectionPageLead>
      <LookupTable entity="dealerType" rows={rows} />
    </div>
  );
}
