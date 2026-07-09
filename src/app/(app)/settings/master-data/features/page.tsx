import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataFeaturesPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("feature");

  return (
    <div className="space-y-4">
      <SectionPageLead>Product feature lookup for model specifications.</SectionPageLead>
      <LookupTable entity="feature" rows={rows} />
    </div>
  );
}
