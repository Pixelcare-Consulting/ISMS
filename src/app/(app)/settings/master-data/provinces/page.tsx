import {
  listLookupParentOptionsAction,
  listLookupsAction,
} from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataProvincesPage() {
  await requirePermission("master_data.manage");
  const [rows, regions] = await Promise.all([
    listLookupsAction("province"),
    listLookupParentOptionsAction("province"),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>Provinces, optionally assigned to a region.</SectionPageLead>
      <LookupTable entity="province" rows={rows} parentOptions={regions} />
    </div>
  );
}
