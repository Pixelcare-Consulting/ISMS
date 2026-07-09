import {
  listLookupParentOptionsAction,
  listLookupsAction,
} from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataCategoriesPage() {
  await requirePermission("master_data.manage");
  const [rows, brands] = await Promise.all([
    listLookupsAction("category"),
    listLookupParentOptionsAction("category"),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>Product categories, optionally linked to a brand.</SectionPageLead>
      <LookupTable entity="category" rows={rows} parentOptions={brands} />
    </div>
  );
}
