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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  projectDisplayUnitMove,
  statusCountByCode,
} from "@/features/inventory/utils/branch-inventory-v2";
import { cn } from "@/utils/cn";

export type StatusConfirmKind = "display" | "defect";

interface StatusConfirmDialogProps {
  open: boolean;
  units: readonly { id: string; serialNo: string }[];
  statuses: readonly { code: string; name: string; count: number }[];
  busy: boolean;
  initialKind?: StatusConfirmKind;
  onOpenChange: (open: boolean) => void;
  onConfirm: (kind: StatusConfirmKind, reason: string) => void;
}

function confirmLabel(kind: StatusConfirmKind, busy: boolean): string {
  if (busy) return "Saving…";
  switch (kind) {
    case "display":
      return "Confirm display units";
    case "defect":
      return "Send for approval";
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
  initialKind = "display",
  onOpenChange,
  onConfirm,
}: StatusConfirmDialogProps) {
  const [kind, setKind] = useState<StatusConfirmKind>(initialKind);
  const [reason, setReason] = useState("");

  const displayMove = projectDisplayUnitMove(units.length, statuses);
  const stock = statusCountByCode(statuses, "STK", "In stock");
  const defective = statusCountByCode(statuses, "DEF", "Defective");
  const preview = units.slice(0, 8);
  const hidden = units.length - preview.length;
  const reasonMissing = kind === "defect" && reason.trim().length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
        if (!next) {
          setReason("");
          setKind(initialKind);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change inventory status</DialogTitle>
          <DialogDescription>
            {units.length === 1
              ? "Choose how this in-stock unit should change."
              : `Choose how ${units.length} in-stock units should change.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setKind("display")}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              kind === "display"
                ? "border-teal-300 bg-teal-50/80 ring-2 ring-teal-400/60 dark:border-teal-800 dark:bg-teal-950/40"
                : "border-border hover:bg-muted/40",
            )}
          >
            <p className="text-sm font-medium">Display unit (DU)</p>
            <p className="mt-1 text-xs text-muted-foreground">Moves from in stock to display floor.</p>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setKind("defect")}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              kind === "defect"
                ? "border-rose-300 bg-rose-50/80 ring-2 ring-rose-400/60 dark:border-rose-900 dark:bg-rose-950/40"
                : "border-border hover:bg-muted/40",
            )}
          >
            <p className="text-sm font-medium">Defective (DEF)</p>
            <p className="mt-1 text-xs text-muted-foreground">Sends a report to the branch team leader.</p>
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Review selected serials
          </p>
          <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            {preview.map((unit) => (
              <li key={unit.id} className="flex items-baseline justify-between gap-2 font-mono text-xs">
                <span>{unit.serialNo}</span>
                <span className="text-muted-foreground">
                  {kind === "display" ? "Stock → display" : "Stays in stock"}
                </span>
              </li>
            ))}
            {hidden > 0 ? <li className="text-xs text-muted-foreground">+ {hidden} more</li> : null}
          </ul>
        </div>

        {kind === "defect" ? (
          <div className="space-y-2">
            <Label htmlFor="v2-defect-reason">Reason for defective report</Label>
            <Textarea
              id="v2-defect-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe what is wrong with these units"
              maxLength={500}
              rows={3}
            />
          </div>
        ) : null}

        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          {kind === "display" ? (
            <p>
              Stock ({stock.code}) goes from {displayMove.stock.count.toLocaleString()} to{" "}
              {displayMove.stock.after.toLocaleString()}. Display ({displayMove.display.code}) goes from{" "}
              {displayMove.display.count.toLocaleString()} to {displayMove.display.after.toLocaleString()}.
            </p>
          ) : (
            <p>
              Units stay in stock ({stock.count.toLocaleString()} {stock.code}) until the branch team leader
              approves. Defective count ({defective.count.toLocaleString()} {defective.code}) does not change
              yet.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || units.length === 0 || reasonMissing}
            className={cn(
              kind === "display" && "bg-teal-600 hover:bg-teal-700 dark:bg-teal-500",
              kind === "defect" && "bg-rose-700 hover:bg-rose-800 dark:bg-rose-600",
            )}
            onClick={() => onConfirm(kind, reason.trim())}
          >
            {confirmLabel(kind, busy)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
