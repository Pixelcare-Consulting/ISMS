import { listModelsAction } from "@/features/master-data/actions/master-data.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { MasterDataModelsTable } from "@/app/(app)/settings/master-data/_components/master-data-models-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function MasterDataModelsPage() {
  await requirePermission("master_data.manage");
  const models = await listModelsAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master data — Models"
        description="SKUs authorized for branch planograms and orders."
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/master-data/brands">Brands</Link>
          </Button>
        }
      />
      <MasterDataModelsTable models={models} />
    </div>
  );
}
