import { redirect } from "next/navigation";

import { CreateOrderForm } from "@/app/(app)/orders/_components/create-order-form";
import { SC_NEW_ORDER_HREF } from "@/app/(app)/service-centers/orders/new/_components/sc-order-setup";
import {
  hasOrderPermission,
  orderPermissionCandidates,
} from "@/features/orders/constants/order-permissions";
import { requireAnyPermission } from "@/lib/auth/permissions";

interface PageProps {
  searchParams: Promise<{
    /** Ignored: the order type follows the order's lines (old links still carry it). */
    type?: string;
    dealerId?: string;
    branchId?: string;
    modeOfPaymentId?: string;
    ready?: string;
    /** Old links: `service_center` now lives under Service centers, Orders. */
    for?: string;
    serviceCenterId?: string;
    cardCode?: string;
  }>;
}

/** Old service-center links open the Service centers create page on the same setup. */
function legacyServiceCenterHref(params: Awaited<PageProps["searchParams"]>): string {
  const query = new URLSearchParams();
  if (params.serviceCenterId) query.set("serviceCenterId", params.serviceCenterId);
  if (params.cardCode) query.set("cardCode", params.cardCode);
  if (params.ready) query.set("ready", params.ready);
  const search = query.toString();
  return search ? `${SC_NEW_ORDER_HREF}?${search}` : SC_NEW_ORDER_HREF;
}

export default async function NewManualOrderPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if (params.for === "service_center") redirect(legacyServiceCenterHref(params));

  const session = await requireAnyPermission([
    ...orderPermissionCandidates("manual", "create"),
    ...orderPermissionCandidates("special", "create"),
  ]);
  const canCreateManual = hasOrderPermission(session.user.permissions, "manual", "create");
  const canCreateSpecial = hasOrderPermission(session.user.permissions, "special", "create");

  return (
    <CreateOrderForm
      canCreateManual={canCreateManual}
      canCreateSpecial={canCreateSpecial}
      prefill={{
        dealerId: params.dealerId,
        branchId: params.branchId,
      }}
      initialReady={params.ready === "1"}
      initialModeOfPaymentId={params.modeOfPaymentId ?? ""}
    />
  );
}
