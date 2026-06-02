import {
  listBrandsAction,
  listCategoriesAction,
} from "@/features/master-data/actions/master-data.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { MasterDataBrandsPanel } from "@/app/(app)/settings/master-data/_components/master-data-brands-panel";

export default async function MasterDataBrandsPage() {
  await requirePermission("master_data.manage");
  const [brands, categories] = await Promise.all([
    listBrandsAction(),
    listCategoriesAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>Reference data for product models and planograms.</SectionPageLead>
      <MasterDataBrandsPanel brands={brands} categories={categories} />
    </div>
  );
}
