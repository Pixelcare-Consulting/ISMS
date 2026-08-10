import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataCategoriesPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("category");

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Standalone product categories for your own classification (not linked to models yet).
      </SectionPageLead>
      <LookupTable entity="category" rows={rows} />
    </div>
  );
}
