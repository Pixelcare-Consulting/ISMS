import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataProblemDescriptionsPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("problemDescription");

  return (
    <div className="space-y-4">
      <SectionPageLead>Problem description lookup for service requests.</SectionPageLead>
      <LookupTable entity="problemDescription" rows={rows} />
    </div>
  );
}
