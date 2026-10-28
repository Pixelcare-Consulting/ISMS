import { redirect } from "next/navigation";

import { CreateOrderForm } from "@/app/(app)/orders/_components/create-order-form";
import {
  hasOrderPermission,
  orderPermissionCandidates,
} from "@/features/orders/constants/order-permissions";
import { requireAnyPermission } from "@/lib/auth/permissions";

interface PageProps {
  searchParams: Promise<{
    type?: string;
    dealerId?: string;
    branchId?: string;
    modeOfPaymentId?: string;
    ready?: string;
  }>;
}

export default async function NewManualOrderPage({ searchParams }: PageProps) {
  const session = await requireAnyPermission([
    ...orderPermissionCandidates("manual", "create"),
    ...orderPermissionCandidates("special", "create"),
  ]);
  const params = await searchParams;
  const canCreateManual = hasOrderPermission(session.user.permissions, "manual", "create");
  const canCreateSpecial = hasOrderPermission(session.user.permissions, "special", "create");

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
      prefill={{
        dealerId: params.dealerId,
        branchId: params.branchId,
      }}
      initialReady={params.ready === "1"}
      initialModeOfPaymentId={params.modeOfPaymentId ?? ""}
    />
  );
}
