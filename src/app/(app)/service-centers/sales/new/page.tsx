import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import { SC_SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ScNewSaleForm } from "@/app/(app)/service-centers/sales/new/_components/sc-new-sale-form";
import { requirePermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "New service center sale",
  "Encode a sale from service center STK stock.",
);

export default async function ScNewSalePage() {
  await requirePermission("service_centers.sales.create");
  const centers = await listScCentersForOpsAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="New service center sale"
        sticky={false}
        tutorial={SC_SALES_PAGE_TUTORIAL}
        description="Pick a service center location and an available STK serial."
      />
      <ScNewSaleForm centers={centers} />
    </div>
  );
}
