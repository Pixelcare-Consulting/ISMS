import {
  listModelsAction,
  listModelFormLookupsAction,
  listPriceListsAction,
} from "@/features/master-data/actions/master-data.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { PriceListsPanel } from "@/app/(app)/settings/master-data/_components/price-lists-panel";

export default async function MasterDataPriceListsPage() {
  await requirePermission("master_data.manage");
  const [initialRows, models, lookups] = await Promise.all([
    listPriceListsAction(),
    listModelsAction(),
    listModelFormLookupsAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Period-based SRP rows by model and package type.
      </SectionPageLead>
      <PriceListsPanel
        initialRows={initialRows}
        models={models.map((model) => ({
          id: model.id,
          skuCode: model.skuCode,
          name: model.name,
        }))}
        packageTypes={lookups.packageTypes}
      />
    </div>
  );
}
