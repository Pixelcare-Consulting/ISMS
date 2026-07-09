import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataCustomerDeliveryMethodsPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("customerDeliveryMethod");

  return (
    <div className="space-y-4">
      <SectionPageLead>Delivery method lookup for customer orders.</SectionPageLead>
      <LookupTable entity="customerDeliveryMethod" rows={rows} />
    </div>
  );
}
