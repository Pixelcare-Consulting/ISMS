import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataCompetitorBrandsPage() {
  await requirePermission("master_data.manage");
  const [rows, models] = await Promise.all([
    listLookupsAction("competitorBrand"),
    listLookupsAction("competitorModel"),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Competitor brands with nested models for market observations (name and active status
        only).
      </SectionPageLead>
      <LookupTable entity="competitorBrand" rows={rows} childRows={models} />
    </div>
  );
}
