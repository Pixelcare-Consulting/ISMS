import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataSaleTypesPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("saleType");

  return (
    <div className="space-y-4">
      <SectionPageLead>Sale type lookup for sales transactions.</SectionPageLead>
      <LookupTable entity="saleType" rows={rows} />
    </div>
  );
}
