import { listLookupsAction } from "@/features/lookups/actions/lookup.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { LookupTable } from "@/app/(app)/settings/master-data/_components/lookup-table";

export default async function MasterDataDocumentTypesPage() {
  await requirePermission("master_data.manage");
  const [rows, returnTypes] = await Promise.all([
    listLookupsAction("documentType"),
    listLookupsAction("returnType"),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>Document types with their return type breakdowns.</SectionPageLead>
      <LookupTable entity="documentType" rows={rows} childRows={returnTypes} />
    </div>
  );
}
