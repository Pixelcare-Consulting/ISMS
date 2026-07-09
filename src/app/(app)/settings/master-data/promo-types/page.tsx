import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataPromoTypesPage() {
  await requirePermission("master_data.manage");
  const rows = await listLookupsAction("promoType");

  return (
    <div className="space-y-4">
      <SectionPageLead>Promo type lookup for sales promotions.</SectionPageLead>
      <LookupTable entity="promoType" rows={rows} />
    </div>
  );
}
