import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataDealerAreasPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("dealerArea");

  return (
    <div className="space-y-4">
      <SectionPageLead>Dealer area lookup for dealer coverage.</SectionPageLead>
      <LookupTable entity="dealerArea" rows={rows} />
    </div>
  );
}
