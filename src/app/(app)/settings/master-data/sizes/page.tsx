import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataSizesPage() {
  await requirePermission("master_data.manage");
  const [rows, actualSizes] = await Promise.all([
    listLookupsAction("size"),
    listLookupsAction("actualSize"),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Product sizes with their actual size breakdowns (name, class).
      </SectionPageLead>
      <LookupTable entity="size" rows={rows} childRows={actualSizes} />
    </div>
  );
}
