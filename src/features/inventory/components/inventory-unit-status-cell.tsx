"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  approveInventoryDefectAction,
  rejectInventoryDefectAction,
  reportInventoryDefectAction,
} from "@/features/inventory/actions/defect.actions";
import { updateInventoryStatusAction } from "@/features/inventory/actions/inventory.actions";
import { DefectProblemChecklist } from "@/features/inventory/components/defect-problem-checklist";
import {
  useNotifyInventoryListRefresh,
  type InventoryStatusSnapshot,
} from "@/features/inventory/components/inventory-list-refresh";
import { canApproveTransferAt } from "@/features/logistics/lib/transfer-approver";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { cn } from "@/utils/cn";

const InventoryApprovalBranchIdsContext = createContext<string[] | null>([]);

/** `null` means this person can decide a defect for every branch (Super Admin). */
export function InventoryApprovalBranchIdsProvider({
  approvalBranchIds,
  children,
}: {
  approvalBranchIds: string[] | null;
  children: ReactNode;
}) {
  return (
    <InventoryApprovalBranchIdsContext.Provider value={approvalBranchIds}>
      {children}
    </InventoryApprovalBranchIdsContext.Provider>
  );
}

export interface InventoryStatusUnit {
  id: string;
  branchId: string;
  statusCode: { code: string; name: string; color: string | null };
  pendingDefectInspection: boolean;
  pendingDefectReportId: string | null;
}

interface InventoryUnitStatusCellProps {
  unit: InventoryStatusUnit;
  disabled?: boolean;
  className?: string;
}

type ImmediateStatusCode = "STK" | "DU";

const IMMEDIATE_STATUS: Record<ImmediateStatusCode, InventoryStatusSnapshot> = {
  STK: { code: "STK", name: "Stock", color: null },
  DU: { code: "DU", name: "Display unit", color: null },
};

/** Clicks inside the status cell must not reach a parent row that expands or collapses. */
function keepParentRowOpen(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function InventoryUnitStatusCell({
  unit,
  disabled = false,
  className,
}: InventoryUnitStatusCellProps) {
  const router = useRouter();
  const notifyRows = useNotifyInventoryListRefresh();
  const approvalBranchIds = useContext(InventoryApprovalBranchIdsContext);
  const [busy, setBusy] = useState(false);
  const [defectOpen, setDefectOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const [statusOverride, setStatusOverride] = useState<InventoryStatusSnapshot | null>(null);
  const [reportedPending, setReportedPending] = useState(false);
  const defectOpenedAt = useRef(0);

  if (statusOverride && unit.statusCode.code === statusOverride.code) {
    setStatusOverride(null);
  }
  if (reportedPending && unit.pendingDefectInspection) {
    setReportedPending(false);
  }

  const displayedStatus =
    statusOverride && unit.statusCode.code !== statusOverride.code
      ? statusOverride
      : unit.statusCode;
  const code = displayedStatus.code;
  const canChange = code === "STK" || code === "DU";
  const pending = unit.pendingDefectInspection || reportedPending;
  const canDecide =
    pending &&
    unit.pendingDefectReportId != null &&
    canApproveTransferAt(approvalBranchIds, unit.branchId);
  const actionsLocked = disabled || busy || pending;

  async function changeStatus(targetCode: ImmediateStatusCode) {
    setBusy(true);
    const result = await updateInventoryStatusAction(unit.id, targetCode);
    setBusy(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    const nextStatus = IMMEDIATE_STATUS[targetCode];
    setStatusOverride(nextStatus);
    notifyRows({
      kind: "status",
      inventoryId: unit.id,
      fromCode: code,
      toCode: targetCode,
      statusCode: nextStatus,
    });
    toast.success(targetCode === "DU" ? "Marked as a display unit" : "Returned to stock");
    router.refresh();
  }

  function openDefectDialog(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    defectOpenedAt.current = performance.now();
    setDefectOpen(true);
  }

  async function submitDefect() {
    const reason = problem.trim();
    if (!reason) {
      toast.error("Choose at least one problem before sending");
      return;
    }
    setBusy(true);
    const result = await reportInventoryDefectAction({
      branchInventoryId: unit.id,
      reason,
    });
    setBusy(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    setProblem("");
    setDefectOpen(false);
    setReportedPending(true);
    notifyRows({ kind: "defect-pending", inventoryId: unit.id });
    toast.success("Sent to the team leader");
    router.refresh();
  }

  async function decide(kind: "approve" | "reject") {
    if (!unit.pendingDefectReportId) return;
    setBusy(true);
    const result =
      kind === "approve"
        ? await approveInventoryDefectAction({ reportId: unit.pendingDefectReportId })
        : await rejectInventoryDefectAction({ reportId: unit.pendingDefectReportId });
    setBusy(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(kind === "approve" ? "Marked defective" : "Defect report rejected");
    router.refresh();
  }

  return (
    <div
      className={cn("flex min-w-0 flex-col items-start gap-1.5", className, disabled && "opacity-70")}
      onClick={keepParentRowOpen}
      onPointerDown={keepParentRowOpen}
    >
      <StatusCodeBadge
        code={displayedStatus.code}
        name={displayedStatus.name}
        color={displayedStatus.color}
        showCode
      />
      {canChange ? (
        <div className="flex flex-col items-start gap-1">
          {pending ? (
            <p className="text-xs text-muted-foreground">Waiting for team leader</p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {code === "STK" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={actionsLocked}
                onClick={() => {
                  void changeStatus("DU");
                }}
              >
                Display unit
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={actionsLocked}
                onClick={() => {
                  void changeStatus("STK");
                }}
              >
                Stock
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionsLocked}
              onPointerDown={keepParentRowOpen}
              onClick={openDefectDialog}
            >
              Defective
            </Button>
            {canDecide ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled || busy}
                  onClick={() => {
                    void decide("approve");
                  }}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || busy}
                  onClick={() => {
                    void decide("reject");
                  }}
                >
                  Reject
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog
        open={defectOpen}
        onOpenChange={(open) => {
          if (busy) return;
          if (!open && performance.now() - defectOpenedAt.current < 400) return;
          setDefectOpen(open);
          if (!open) setProblem("");
        }}
      >
        <DialogContent className="z-[80]" overlayClassName="z-[80]">
          <DialogHeader>
            <DialogTitle>Report a defect</DialogTitle>
            <DialogDescription>
              Choose the problem. The unit stays as it is until the branch team leader approves.
            </DialogDescription>
          </DialogHeader>
          <DefectProblemChecklist disabled={busy} onReasonChange={setProblem} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setDefectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || problem.trim().length === 0}
              onClick={() => {
                void submitDefect();
              }}
            >
              Send for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
