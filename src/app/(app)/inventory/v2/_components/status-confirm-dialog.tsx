"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DefectProblemChecklist } from "@/features/inventory/components/defect-problem-checklist";
import {
  branchStatusTargets,
  projectDisplayUnitMove,
  projectReturnToStockMove,
  statusCountByCode,
  type BranchChangeableStatus,
  type BranchStatusTarget,
} from "@/features/inventory/utils/branch-inventory-v2";
import { cn } from "@/utils/cn";

export type StatusConfirmKind = "display" | "stock" | "defect";

interface StatusConfirmDialogProps {
  open: boolean;
  units: readonly { id: string; serialNo: string }[];
  statuses: readonly { code: string; name: string; count: number }[];
  busy: boolean;
  sourceStatus: BranchChangeableStatus;
  initialKind?: StatusConfirmKind;
  onOpenChange: (open: boolean) => void;
  onConfirm: (kind: StatusConfirmKind, reason: string) => void;
}

const TARGET_COPY: Record<
  BranchStatusTarget,
  { kind: StatusConfirmKind; title: string; detail: string }
> = {
  DU: {
    kind: "display",
    title: "Display unit (DU)",
    detail: "Moves from in stock to the display floor.",
  },
  STK: {
    kind: "stock",
    title: "In stock (STK)",
    detail: "Returns the display unit to stock.",
  },
  DEF: {
    kind: "defect",
    title: "Defective (DEF)",
    detail: "Choose the problem from the checklist. Status stays until the team leader approves.",
  },
};

function kindForTarget(target: BranchStatusTarget): StatusConfirmKind {
  return TARGET_COPY[target].kind;
}

function legalKind(kind: StatusConfirmKind, source: BranchChangeableStatus): StatusConfirmKind {
  const allowed = branchStatusTargets(source).map(kindForTarget);
  if (allowed.includes(kind)) return kind;
  return source === "DU" ? "stock" : "display";
}

function confirmLabel(kind: StatusConfirmKind, busy: boolean): string {
  if (busy) return "Saving…";
  switch (kind) {
    case "display":
      return "Confirm display units";
    case "stock":
      return "Return to stock";
    case "defect":
      return "Send for approval";
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function reviewChange(kind: StatusConfirmKind, source: BranchChangeableStatus): string {
  switch (kind) {
    case "display":
      return "Stock → display";
    case "stock":
      return "Display → stock";
    case "defect":
      return source === "DU" ? "Stays on display" : "Stays in stock";
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

export function StatusConfirmDialog({
  open,
  units,
  statuses,
  busy,
  sourceStatus,
  initialKind = "display",
  onOpenChange,
  onConfirm,
}: StatusConfirmDialogProps) {
  const startingKind = legalKind(initialKind, sourceStatus);
  const [kind, setKind] = useState<StatusConfirmKind>(startingKind);
  const [reason, setReason] = useState("");

  const targets = branchStatusTargets(sourceStatus);
  const displayMove = projectDisplayUnitMove(units.length, statuses);
  const stockMove = projectReturnToStockMove(units.length, statuses);
  const stock = statusCountByCode(statuses, "STK", "In stock");
  const display = statusCountByCode(statuses, "DU", "Display unit");
  const defective = statusCountByCode(statuses, "DEF", "Defective");
  const preview = units.slice(0, 8);
  const hidden = units.length - preview.length;
  const reasonMissing = kind === "defect" && reason.trim().length === 0;
  const sourceLabel = sourceStatus === "DU" ? "display" : "in-stock";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
        if (!next) {
          setReason("");
          setKind(startingKind);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change inventory status</DialogTitle>
          <DialogDescription>
            {units.length === 1
              ? `Choose how this ${sourceLabel} unit should change.`
              : `Choose how ${units.length} ${sourceLabel} units should change.`}
          </DialogDescription>
        </DialogHeader>

        <div className={cn("grid gap-2", targets.length > 1 && "sm:grid-cols-2")}>
          {targets.map((target) => {
            const copy = TARGET_COPY[target];
            const selected = kind === copy.kind;
            const defectTone = target === "DEF";
            return (
              <button
                key={target}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (copy.kind !== kind) setReason("");
                  setKind(copy.kind);
                }}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  selected &&
                    defectTone &&
                    "border-rose-300 bg-rose-50/80 ring-2 ring-rose-400/60 dark:border-rose-900 dark:bg-rose-950/40",
                  selected &&
                    !defectTone &&
                    "border-teal-300 bg-teal-50/80 ring-2 ring-teal-400/60 dark:border-teal-800 dark:bg-teal-950/40",
                  !selected && "border-border hover:bg-muted/40",
                )}
              >
                <p className="text-sm font-medium">{copy.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{copy.detail}</p>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Review selected serials
          </p>
          <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            {preview.map((unit) => (
              <li key={unit.id} className="flex items-baseline justify-between gap-2 font-mono text-xs">
                <span>{unit.serialNo}</span>
                <span className="text-muted-foreground">{reviewChange(kind, sourceStatus)}</span>
              </li>
            ))}
            {hidden > 0 ? <li className="text-xs text-muted-foreground">+ {hidden} more</li> : null}
          </ul>
        </div>

        {kind === "defect" ? (
          <DefectProblemChecklist disabled={busy} onReasonChange={setReason} />
        ) : null}

        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          {kind === "display" ? (
            <p>
              Stock ({stock.code}) goes from {displayMove.stock.count.toLocaleString()} to{" "}
              {displayMove.stock.after.toLocaleString()}. Display ({displayMove.display.code}) goes from{" "}
              {displayMove.display.count.toLocaleString()} to {displayMove.display.after.toLocaleString()}.
            </p>
          ) : null}
          {kind === "stock" ? (
            <p>
              Display ({display.code}) goes from {stockMove.display.count.toLocaleString()} to{" "}
              {stockMove.display.after.toLocaleString()}. Stock ({stock.code}) goes from{" "}
              {stockMove.stock.count.toLocaleString()} to {stockMove.stock.after.toLocaleString()}.
            </p>
          ) : null}
          {kind === "defect" ? (
            <p>
              {sourceStatus === "DU"
                ? `Units stay on display (${display.count.toLocaleString()} ${display.code})`
                : `Units stay in stock (${stock.count.toLocaleString()} ${stock.code})`}{" "}
              until the branch team leader approves. Defective count (
              {defective.count.toLocaleString()} {defective.code}) does not change yet.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || units.length === 0 || reasonMissing}
            className={cn(
              (kind === "display" || kind === "stock") &&
                "bg-teal-600 hover:bg-teal-700 dark:bg-teal-500",
              kind === "defect" && "bg-rose-700 hover:bg-rose-800 dark:bg-rose-600",
            )}
            onClick={() => onConfirm(kind, kind === "defect" ? reason.trim() : "")}
          >
            {confirmLabel(kind, busy)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
