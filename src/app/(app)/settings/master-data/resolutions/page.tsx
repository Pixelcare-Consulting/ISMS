import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataResolutionsPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("resolution");

  return (
    <div className="space-y-4">
      <SectionPageLead>Display resolution lookup for product models.</SectionPageLead>
      <LookupTable entity="resolution" rows={rows} />
    </div>
  );
}
