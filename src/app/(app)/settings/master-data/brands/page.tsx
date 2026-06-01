import {
  listBrandsAction,
  listCategoriesAction,
} from "@/features/master-data/actions/master-data.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { MasterDataBrandsPanel } from "@/app/(app)/settings/master-data/_components/master-data-brands-panel";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function MasterDataBrandsPage() {
  await requirePermission("master_data.manage");
  const [brands, categories] = await Promise.all([
    listBrandsAction(),
    listCategoriesAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master data — Brands"
        description="Reference data for product models and planograms."
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/master-data/models">Models</Link>
          </Button>
        }
      />
      <MasterDataBrandsPanel brands={brands} categories={categories} />
    </div>
  );
}
