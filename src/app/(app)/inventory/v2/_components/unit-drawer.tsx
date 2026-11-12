"use client";

import { useEffect } from "react";

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
  markBranchInventoryStatusReadAction,
  type InventoryListItem,
} from "@/features/inventory/actions/inventory.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  branchSerialLabel,
  branchSerialSelectionBlock,
  type BranchSerialSelectionBlock,
} from "@/features/inventory/utils/branch-inventory-v2";
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
  const inventoryId = unit?.id ?? null;
  const statusCode = unit?.statusCode.code ?? null;

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

  const serial = unit ? branchSerialLabel(unit.serialNumber.serialNo) : "";
  const changeBlock = unit
    ? branchSerialSelectionBlock({
        serialNo: unit.serialNumber.serialNo,
        statusCode: unit.statusCode.code,
        pendingDefectInspection: unit.pendingDefectInspection,
      })
    : null;

  return (
    <Sheet open={unit != null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        {unit ? (
          <>
            <SheetHeader className="text-left">
              <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                Unit details
              </p>
              <SheetTitle className="font-mono text-2xl tracking-tight">{serial}</SheetTitle>
              <SheetDescription>
                {unit.serialNumber.model.sku} · {unit.serialNumber.model.name}
              </SheetDescription>
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusCodeBadge
                    code={unit.statusCode.code}
                    name={unit.statusCode.name}
                    color={unit.statusCode.color ?? undefined}
                    showCode
                  />
                  {!unit.onPlanogram ? (
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
                    {formatInventoryStatusUpdated(unit.statusUpdatedAt)}
                  </span>
                </p>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-5 px-4 pb-4">
              {!unit.onPlanogram ? (
                <div
                  className={cn(
                    "rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 text-sm text-amber-950",
                    "dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100",
                  )}
                  role="status"
                >
                  Not on the branch planogram.{" "}
                  {unit.statusCode.code === "DEF"
                    ? "A defective unit stays defective."
                    : `Its stock status stays ${unit.statusCode.code} until you change it.`}
                </div>
              ) : null}
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail
                  label="Branch"
                  value={`${unit.branch.name} · Branch code ${unit.branch.sapCode}`}
                />
                <Detail label="Model" value={unit.serialNumber.model.sku} />
                <Detail
                  label="Aging"
                  value={unit.agingDays === 1 ? "1 day" : `${unit.agingDays} days`}
                />
                <Detail label="SAP document" value={recordOrMissing(unit.deliveryNo)} />
                <Detail
                  label="DR date"
                  value={
                    unit.deliveryDate
                      ? formatInventoryDrDate(unit.deliveryDate)
                      : "Not recorded"
                  }
                />
              </dl>
            </div>

            <SheetFooter className="flex-col gap-2 border-t px-4 py-4 sm:flex-col">
              <p className="w-full text-center text-xs text-muted-foreground">
                Changes apply to this serialized unit only.
              </p>
              {changeBlock ? (
                <p
                  className="w-full rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100"
                  role="status"
                >
                  {statusChangeReason(changeBlock)}
                </p>
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
