import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataPackageTypesPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("packageType");

  return (
    <div className="space-y-4">
      <SectionPageLead>Package type lookup for orders, sales, and price lists.</SectionPageLead>
      <LookupTable entity="packageType" rows={rows} />
    </div>
  );
}
