import { listModelsAction } from "@/features/master-data/actions/master-data.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { MasterDataModelsTable } from "@/app/(app)/settings/master-data/_components/master-data-models-table";

export default async function MasterDataModelsPage() {
  await requirePermission("master_data.manage");
  const models = await listModelsAction();

  return (
    <div className="space-y-4">
      <SectionPageLead>SKUs for branch planograms and orders (active / hold / retired).</SectionPageLead>
      <MasterDataModelsTable models={models} />
    </div>
  );
}
