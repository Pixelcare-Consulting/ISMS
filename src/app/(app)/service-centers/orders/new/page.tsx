import { ScCreateOrderForm } from "@/app/(app)/service-centers/orders/new/_components/sc-create-order-form";
import { SC_ORDERS_CREATE } from "@/features/service-center-ops/constants/sc-permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Create service center order",
  "Order models from the SAP warehouse for a service center.",
);

interface PageProps {
  searchParams: Promise<{ serviceCenterId?: string; cardCode?: string; ready?: string }>;
}

export default async function ScNewOrderPage({ searchParams }: PageProps) {
  await requirePermission(SC_ORDERS_CREATE);
  const params = await searchParams;
  // Only the setup popup's Continue opens the order; a bare visit starts in the popup.
  const serviceCenterId = params.ready === "1" ? (params.serviceCenterId ?? "") : "";
  const cardCode = params.ready === "1" ? (params.cardCode ?? "") : "";
  return (
    <ScCreateOrderForm
      // A new setup is a new order: reset lines and inputs.
      key={`${serviceCenterId}:${cardCode}`}
      serviceCenterId={serviceCenterId}
      cardCode={cardCode}
    />
  );
}
