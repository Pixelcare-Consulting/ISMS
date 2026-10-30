import { redirect } from "next/navigation";

import { CreateOrderForm } from "@/app/(app)/orders/_components/create-order-form";
import { CreateServiceCenterOrderForm } from "@/app/(app)/orders/_components/create-service-center-order-form";
import { SC_ORDERS_CREATE } from "@/features/service-center-ops/constants/sc-permissions";
import {
  hasOrderPermission,
  orderPermissionCandidates,
} from "@/features/orders/constants/order-permissions";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";

interface PageProps {
  searchParams: Promise<{
    type?: string;
    dealerId?: string;
    branchId?: string;
    modeOfPaymentId?: string;
    ready?: string;
    /** `service_center` opens the service-center order; anything else a branch order. */
    for?: string;
    serviceCenterId?: string;
    cardCode?: string;
  }>;
}

export default async function NewManualOrderPage({ searchParams }: PageProps) {
  const session = await requireAnyPermission([
    ...orderPermissionCandidates("manual", "create"),
    ...orderPermissionCandidates("special", "create"),
    SC_ORDERS_CREATE,
  ]);
  const params = await searchParams;
  const canCreateManual = hasOrderPermission(session.user.permissions, "manual", "create");
  const canCreateSpecial = hasOrderPermission(session.user.permissions, "special", "create");
  const canCreateServiceCenter = hasPermission(session.user.permissions, SC_ORDERS_CREATE);

  // A service-center-only user lands on the service-center order; it opens its own setup.
  const forServiceCenter =
    params.for === "service_center" || (!canCreateManual && !canCreateSpecial);
  if (forServiceCenter) {
    if (!canCreateServiceCenter) redirect("/dashboard?error=forbidden");
    const serviceCenterId = params.ready === "1" ? (params.serviceCenterId ?? "") : "";
    const cardCode = params.ready === "1" ? (params.cardCode ?? "") : "";
    return (
      <CreateServiceCenterOrderForm
        // A new setup is a new order: reset lines and inputs.
        key={`${serviceCenterId}:${cardCode}`}
        serviceCenterId={serviceCenterId}
        cardCode={cardCode}
        canCreateManual={canCreateManual}
        canCreateSpecial={canCreateSpecial}
      />
    );
  }

  if (params.type && params.type !== "manual" && params.type !== "special") {
    redirect("/dashboard?error=forbidden");
  }
  if (params.type === "manual" && !canCreateManual) {
    redirect("/dashboard?error=forbidden");
  }
  if (params.type === "special" && !canCreateSpecial) {
    redirect("/dashboard?error=forbidden");
  }

  const initialType =
    params.type === "special" || params.type === "manual"
      ? params.type
      : canCreateManual
        ? "manual"
        : "special";

  return (
    <CreateOrderForm
      initialType={initialType}
      canCreateManual={canCreateManual}
      canCreateSpecial={canCreateSpecial}
      canCreateServiceCenter={canCreateServiceCenter}
      prefill={{
        dealerId: params.dealerId,
        branchId: params.branchId,
      }}
      initialReady={params.ready === "1"}
      initialModeOfPaymentId={params.modeOfPaymentId ?? ""}
    />
  );
}
