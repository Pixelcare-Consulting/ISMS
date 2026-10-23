import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataAccessoryCompletenessPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("accessoryCompleteness");

  return (
    <div className="space-y-4">
      <SectionPageLead>Accessory completeness lookup for pull-out requests.</SectionPageLead>
      <LookupTable entity="accessoryCompleteness" rows={rows} fixedPageSize />
    </div>
  );
}
