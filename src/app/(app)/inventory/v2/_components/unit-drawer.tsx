"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  formatInventoryDrDate,
  formatInventoryStatusUpdated,
} from "@/app/(app)/inventory/_components/inventory-list-format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  approveInventoryDefectAction,
  rejectInventoryDefectAction,
} from "@/features/inventory/actions/defect.actions";
import {
  markBranchInventoryStatusReadAction,
  type InventoryListItem,
} from "@/features/inventory/actions/inventory.actions";
import { useInventoryApprovalBranchIds } from "@/features/inventory/components/inventory-unit-status-cell";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  branchSerialLabel,
  branchSerialSelectionBlock,
  type BranchSerialSelectionBlock,
} from "@/features/inventory/utils/branch-inventory-v2";
import { NO_MODEL_SERIES_LABEL } from "@/features/inventory/utils/group-stock-by-model-series";
import { canApproveTransferAt } from "@/features/logistics/lib/transfer-approver";
import { cn } from "@/utils/cn";

interface UnitDrawerProps {
  unit: InventoryListItem | null;
  onOpenChange: (open: boolean) => void;
  onRequestChangeStatus?: () => void;
  onMarkedRead?: () => void;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function recordOrMissing(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : "Not recorded";
}

function seriesOrEmpty(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : NO_MODEL_SERIES_LABEL;
}

type DefectDecision = "approve" | "reject";

/** Approving marks the unit defective. Rejecting keeps the current status and clears the wait. */
function unitAfterDecision(unit: InventoryListItem, decision: DefectDecision): InventoryListItem {
  const cleared: InventoryListItem = {
    ...unit,
    pendingDefectInspection: false,
    pendingDefectReportId: null,
  };
  if (decision === "reject") return cleared;
  return {
    ...cleared,
    statusUpdatedAt: new Date().toISOString(),
    statusCode: {
      ...unit.statusCode,
      code: "DEF",
      name: "Defective",
      color: null,
    },
  };
}

function statusChangeReason(block: BranchSerialSelectionBlock): string {
  switch (block) {
    case "defective":
      return "A defective unit cannot be changed.";
    case "not-stock":
      return "Only in-stock (STK) and display (DU) units can be changed.";
    case "other-status":
      return "Select one status at a time.";
    case "pending-defect":
      return "Waiting for the team leader.";
    case "missing-serial":
      return "Serial number was not provided.";
    default: {
      const unexpected: never = block;
      return unexpected;
    }
  }
}

export function BranchInventoryUnitDrawer({
  unit,
  onOpenChange,
  onRequestChangeStatus,
  onMarkedRead,
}: UnitDrawerProps) {
  const router = useRouter();
  const approvalBranchIds = useInventoryApprovalBranchIds();
  const inventoryId = unit?.id ?? null;
  const statusCode = unit?.statusCode.code ?? null;
  const [pendingUnitId, setPendingUnitId] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ unitId: string; kind: DefectDecision } | null>(null);
  const busy = pendingUnitId != null && pendingUnitId === inventoryId;
  const decision = applied?.unitId === inventoryId ? applied.kind : null;

  useEffect(() => {
    if (!inventoryId || !statusCode) return;
    let active = true;
    void markBranchInventoryStatusReadAction(inventoryId).then((result) => {
      if (!active || "error" in result) return;
      onMarkedRead?.();
    });
    return () => {
      active = false;
    };
  }, [inventoryId, onMarkedRead, statusCode]);

  const shown = unit == null || decision == null ? unit : unitAfterDecision(unit, decision);
  const serial = shown ? branchSerialLabel(shown.serialNumber.serialNo) : "";
  const changeBlock = shown
    ? branchSerialSelectionBlock({
        serialNo: shown.serialNumber.serialNo,
        statusCode: shown.statusCode.code,
        pendingDefectInspection: shown.pendingDefectInspection,
      })
    : null;
  const canDecide =
    shown != null &&
    shown.pendingDefectInspection &&
    shown.pendingDefectReportId != null &&
    canApproveTransferAt(approvalBranchIds, shown.branch.id);

  async function decide(kind: DefectDecision) {
    const reportId = shown?.pendingDefectReportId;
    const decidedUnitId = shown?.id;
    if (!reportId || !decidedUnitId || busy) return;
    setPendingUnitId(decidedUnitId);
    const result =
      kind === "approve"
        ? await approveInventoryDefectAction({ reportId })
        : await rejectInventoryDefectAction({ reportId });
    setPendingUnitId((current) => (current === decidedUnitId ? null : current));
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    setApplied({ unitId: decidedUnitId, kind });
    toast.success(kind === "approve" ? "Marked defective" : "Defect report rejected");
    router.refresh();
  }

  return (
    <Sheet open={unit != null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        {shown ? (
          <>
            <SheetHeader className="text-left">
              <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                Unit details
              </p>
              <SheetTitle className="font-mono text-2xl tracking-tight">{serial}</SheetTitle>
              <SheetDescription>
                {shown.serialNumber.model.sku} · {shown.serialNumber.model.name}
              </SheetDescription>
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusCodeBadge
                    code={shown.statusCode.code}
                    name={shown.statusCode.name}
                    color={shown.statusCode.color ?? undefined}
                    showCode
                  />
                  {!shown.onPlanogram ? (
                    <Badge
                      variant="outline"
                      className="border-amber-600 text-amber-800 dark:text-amber-200"
                    >
                      Off-planogram
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Status updated{" "}
                  <span className="font-medium text-foreground">
                    {formatInventoryStatusUpdated(shown.statusUpdatedAt)}
                  </span>
                </p>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-5 px-4 pb-4">
              {!shown.onPlanogram ? (
                <div
                  className={cn(
                    "rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 text-sm text-amber-950",
                    "dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100",
                  )}
                  role="status"
                >
                  Not on the branch planogram.{" "}
                  {shown.statusCode.code === "DEF"
                    ? "A defective unit stays defective."
                    : `Its stock status stays ${shown.statusCode.code} until you change it.`}
                </div>
              ) : null}
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail
                  label="Branch"
                  value={`${shown.branch.name} · Branch code ${shown.branch.sapCode}`}
                />
                <Detail label="Model" value={shown.serialNumber.model.sku} />
                <Detail label="Series" value={seriesOrEmpty(shown.serialNumber.model.seriesName)} />
                <Detail
                  label="Aging"
                  value={shown.agingDays === 1 ? "1 day" : `${shown.agingDays} days`}
                />
                <Detail label="SAP document" value={recordOrMissing(shown.deliveryNo)} />
                <Detail
                  label="DR date"
                  value={
                    shown.deliveryDate
                      ? formatInventoryDrDate(shown.deliveryDate)
                      : "Not recorded"
                  }
                />
              </dl>
            </div>

            <SheetFooter className="flex-col gap-2 border-t px-4 py-4 sm:flex-col">
              <p className="w-full text-center text-xs text-muted-foreground">
                Changes apply to this serialized unit only.
              </p>
              {changeBlock && !canDecide ? (
                <p
                  className="w-full rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100"
                  role="status"
                >
                  {statusChangeReason(changeBlock)}
                </p>
              ) : null}
              {canDecide ? (
                <div className="flex w-full gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => {
                      void decide("approve");
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => {
                      void decide("reject");
                    }}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={changeBlock ? "w-full" : "flex-1"}
                  onClick={() => onOpenChange(false)}
                >
                  Close details
                </Button>
                {changeBlock ? null : (
                  <Button
                    type="button"
                    className="flex-1 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500"
                    onClick={() => onRequestChangeStatus?.()}
                  >
                    Change status
                  </Button>
                )}
              </div>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
