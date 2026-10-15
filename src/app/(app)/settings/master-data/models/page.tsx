import {
  listModelFormLookupsAction,
  listModelsAction,
} from "@/features/master-data/actions/master-data.actions";
import { canSyncFromSap } from "@/features/sap/constants/sap-permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { MasterDataModelsTable } from "@/app/(app)/settings/master-data/_components/master-data-models-table";

export default async function MasterDataModelsPage() {
  const session = await requirePermission("master_data.manage");
  const [models, lookups] = await Promise.all([
    listModelsAction(),
    listModelFormLookupsAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>SKUs for branch planograms and orders (active / hold / retired).</SectionPageLead>
      <MasterDataModelsTable
        models={models}
        packageTypes={lookups.packageTypes}
        canSync={canSyncFromSap(session.user.permissions)}
      />
    </div>
  );
}
