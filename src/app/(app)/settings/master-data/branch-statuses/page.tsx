import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataBranchStatusesPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("branchStatusType");

  return (
    <div className="space-y-4">
      <SectionPageLead>Branch status lookup for branch operations.</SectionPageLead>
      <LookupTable entity="branchStatusType" rows={rows} />
    </div>
  );
}
