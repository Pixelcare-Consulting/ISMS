import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataCompetitorsPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("competitor");

  return (
    <div className="space-y-4">
      <SectionPageLead>Competitor name lookup for market observations.</SectionPageLead>
      <LookupTable entity="competitor" rows={rows} />
    </div>
  );
}
