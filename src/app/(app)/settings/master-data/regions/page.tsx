import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataRegionsPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("region");

  return (
    <div className="space-y-4">
      <SectionPageLead>Geographic regions grouping provinces.</SectionPageLead>
      <LookupTable entity="region" rows={rows} />
    </div>
  );
}
