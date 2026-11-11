import { notFound } from "next/navigation";

import { InventoryApprovalBranchIdsProvider } from "@/features/inventory/components/inventory-unit-status-cell";
import { getOpenDefectReportForInventoryAction } from "@/features/inventory/actions/defect.actions";
import { listInventoryStatusOptionsAction } from "@/features/inventory/actions/inventory.actions";
import { defectApprovalBranchIds } from "@/features/inventory/lib/defect-approver";
import { getSerialTraceabilityAction } from "@/features/serial-numbers/actions/serial-number.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SerialDetailView } from "@/app/(app)/inventory/serial-numbers/[id]/_components/serial-detail-view";

interface SerialTraceabilityPageProps {
  params: Promise<{ id: string }>;
}

export default async function SerialTraceabilityPage({
  params,
}: SerialTraceabilityPageProps) {
  const session = await requirePermission("inventory.view");
  const { id } = await params;
  const [serial, inventoryStatusOptions, approvalBranchIds] = await Promise.all([
    getSerialTraceabilityAction(id),
    listInventoryStatusOptionsAction(),
    defectApprovalBranchIds(
      session.user.tenantId,
      session.user.id,
      session.user.roleSlugs,
    ),
  ]);
  if (!serial) {
    notFound();
  }

  const pending = serial.current?.branchInventoryId
    ? await getOpenDefectReportForInventoryAction(serial.current.branchInventoryId)
    : { report: null };

  return (
    <InventoryApprovalBranchIdsProvider approvalBranchIds={approvalBranchIds}>
      <SerialDetailView
        serial={serial}
        inventoryStatusOptions={inventoryStatusOptions}
        pendingDefectReportId={pending.report?.id ?? null}
      />
    </InventoryApprovalBranchIdsProvider>
  );
}
