import { NewSalesTransactionForm } from "@/app/(app)/sales/_components/new-sales-transaction-form";
import { ScSalesSourceProvider } from "@/app/(app)/service-centers/sales/_components/sc-sales-source";
import {
  listBrandsForSalesAction,
  listCustomerDeliveryMethodsForSalesAction,
  listPaymentTypesForSalesAction,
  listPromoTypesForSalesAction,
  listSaleTypesForSalesAction,
} from "@/features/sales/actions/sales.actions";
import { listScCentersForSalesAction } from "@/features/service-center-ops/actions/sc-sales.actions";
import { SC_SALES_CREATE } from "@/features/service-center-ops/constants/sc-permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "New service center sale",
  "Enter header details, add package line sets, then save to update service center stock.",
);

export default async function ScNewSalePage() {
  await requirePermission(SC_SALES_CREATE);

  const [centers, paymentTypes, saleTypes, deliveryMethods, promoTypes, brands] =
    await Promise.all([
      listScCentersForSalesAction(),
      listPaymentTypesForSalesAction(),
      listSaleTypesForSalesAction(),
      listCustomerDeliveryMethodsForSalesAction(),
      listPromoTypesForSalesAction(),
      listBrandsForSalesAction(),
    ]);

  return (
    <ScSalesSourceProvider>
      <NewSalesTransactionForm
        branches={centers}
        autoResolveBranch={centers.length === 1}
        paymentTypes={paymentTypes}
        saleTypes={saleTypes}
        deliveryMethods={deliveryMethods}
        promoTypes={promoTypes}
        brands={brands}
      />
    </ScSalesSourceProvider>
  );
}
