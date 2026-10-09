"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  closeStockCountSessionAction,
  completeStockCountAction,
  investigateStockVarianceAction,
  postStockCountDifferencesAction,
  recordStockCountLineAction,
  recountStockCountLineAction,
  rejectStockVarianceAction,
  scanStockCountSerialAction,
  startStockCountAction,
} from "@/features/stock-audit/actions/stock-audit.actions";
import { StockCountPermissionDialog } from "@/app/(app)/inventory/stock-count/_components/stock-count-permission-dialog";
import { STOCK_COUNT_PERMISSION_MESSAGE } from "@/features/stock-audit/constants/stock-count-permissions";
import {
  POSTABLE_VARIANCE_STATUSES,
  STOCK_COUNT_SESSION_LABELS,
  STOCK_VARIANCE_STATUS_LABELS,
} from "@/features/stock-audit/constants/stock-count-workflow";
import type { StockCountSessionDetailDto } from "@/features/stock-audit/services/stock-count-session-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";

interface StockCountDetailPanelProps {
  session: StockCountSessionDetailDto;
}

export function StockCountDetailPanel({ session }: StockCountDetailPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scanInput, setScanInput] = useState("");
  const [investigationNotes, setInvestigationNotes] = useState<Record<string, string>>({});
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const lineSelection = useTableSelection(session.lines.map((line) => line.id));
  const varianceSelection = useTableSelection(session.variances.map((variance) => variance.id));

  const lineSort = useClientTableSort(session.lines, {
    serial: (line) => line.serialNumber.serialNo,
    sku: (line) => line.model.skuCode,
    status: (line) => line.status,
    expected: (line) => (line.expectedInCount ? "expected" : "surplus"),
  });
  const varianceSort = useClientTableSort(session.variances, {
    serial: (v) => v.line?.serialNumber.serialNo ?? null,
    type: (v) => v.varianceType,
    status: (v) => v.status,
    sapRef: (v) => v.sapDocRef,
  });

  function runAction(
    action: () => Promise<{ error?: string; success?: boolean; message?: string }>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        if (result.error === STOCK_COUNT_PERMISSION_MESSAGE) {
          setPermissionDialogOpen(true);
        } else {
          toast.error(result.error);
        }
        return;
      }
      toast.success(result.message ?? successMessage);
      router.refresh();
    });
  }

  function handleScan() {
    const serialNo = scanInput.trim();
    if (!serialNo) {
      toast.error("Enter or scan a serial number");
      return;
    }
    startTransition(async () => {
      const result = await scanStockCountSerialAction({
        sessionId: session.id,
        serialNo,
      });
      if ("error" in result && result.error) {
        if (result.error === STOCK_COUNT_PERMISSION_MESSAGE) {
          setPermissionDialogOpen(true);
        } else {
          toast.error(result.error);
        }
        return;
      }
      if (!("success" in result) || !result.success) return;
      setScanInput("");
      toast.success(
        result.kind === "surplus"
          ? `Unexpected serial ${result.serialNo} recorded as surplus`
          : `Counted ${result.serialNo}`,
      );
      router.refresh();
    });
  }

  const pendingLines = session.lines.filter((l) => l.status === "pending").length;
  const surplusPending = session.lines.filter(
    (l) => l.status === "counted" && !l.expectedInCount,
  ).length;
  const postableVariances = session.variances.filter((v) =>
    POSTABLE_VARIANCE_STATUSES.includes(
      v.status as (typeof POSTABLE_VARIANCE_STATUSES)[number],
    ),
  );
  const canPost =
    ["counting_complete", "variances_under_investigation", "pending_adjustment"].includes(
      session.status,
    ) && postableVariances.length > 0;
  const canClose =
    [
      "counting_complete",
      "variances_under_investigation",
      "pending_adjustment",
      "adjustment_requested",
    ].includes(session.status) &&
    session.variances.every((v) => ["closed", "rejected"].includes(v.status));
  const canRecountStatuses = [
    "in_progress",
    "counting_complete",
    "variances_under_investigation",
    "pending_adjustment",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/inventory/stock-count"
            className="text-muted-foreground text-sm hover:underline"
          >
            ← Stock count sessions
          </Link>
          <h2 className="text-xl font-semibold">{session.sessionNo}</h2>
          <p className="text-muted-foreground text-sm">
            {session.branch.name} ({session.branch.sapCode})
          </p>
          {session.status === "in_progress" && (
            <p className="text-amber-700 dark:text-amber-400 mt-1 text-xs">
              Soft freeze on — branch stock moves for these serials are blocked until counting
              finishes and differences are posted.
            </p>
          )}
        </div>
        <Badge variant="outline">{STOCK_COUNT_SESSION_LABELS[session.status]}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {session.status === "draft" && (
          <Button
            disabled={pending}
            onClick={() =>
              runAction(() => startStockCountAction(session.id), "Counting started")
            }
          >
            Start counting
          </Button>
        )}
        {session.status === "in_progress" && (
          <Button
            disabled={pending}
            variant="secondary"
            onClick={() =>
              runAction(
                () => completeStockCountAction(session.id),
                pendingLines + surplusPending > 0
                  ? "Counting complete — variances opened"
                  : "Counting complete — no variances",
              )
            }
          >
            Complete counting
            {pendingLines > 0 ? ` (${pendingLines} unscanned)` : ""}
            {surplusPending > 0 ? ` · ${surplusPending} surplus` : ""}
          </Button>
        )}
        {canPost && (
          <Button
            disabled={pending}
            onClick={() =>
              runAction(
                () => postStockCountDifferencesAction(session.id),
                "Differences posted",
              )
            }
          >
            Post differences ({postableVariances.length})
          </Button>
        )}
        {canClose && (
          <Button
            disabled={pending}
            variant="outline"
            onClick={() =>
              runAction(
                () => closeStockCountSessionAction(session.id),
                "Session closed",
              )
            }
          >
            Close session
          </Button>
        )}
      </div>

      {session.status === "in_progress" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1 space-y-1">
            <label htmlFor="stock-count-scan" className="text-sm font-medium">
              Scan serial
            </label>
            <Input
              id="stock-count-scan"
              placeholder="Scan or type serial number"
              value={scanInput}
              disabled={pending}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleScan();
                }
              }}
              autoComplete="off"
            />
          </div>
          <Button disabled={pending} onClick={handleScan}>
            Record scan
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Count lines</h3>
        <p className="text-muted-foreground text-sm">
          Scan serials or mark expected units counted. Unexpected serials become surplus
          candidates.
        </p>
      </div>
      <GlobalDataTable stickyHeader scrollable>
        <TableHeader>
          <TableRow>
            <GlobalTableHead className="w-10">
              <Checkbox
                checked={
                  lineSelection.isAllSelected ||
                  (lineSelection.isPartiallySelected ? "indeterminate" : false)
                }
                onCheckedChange={(checked) => lineSelection.toggleAll(checked === true)}
                aria-label="Select all count lines"
              />
            </GlobalTableHead>
            <TableIndexHead />
            <GlobalTableHead {...lineSort.sortProps("serial")}>Serial</GlobalTableHead>
            <GlobalTableHead {...lineSort.sortProps("sku")}>SKU</GlobalTableHead>
            <GlobalTableHead {...lineSort.sortProps("expected")}>Expected</GlobalTableHead>
            <GlobalTableHead {...lineSort.sortProps("status")}>Status</GlobalTableHead>
            <GlobalTableHead className="text-right">Action</GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineSort.sorted.map((line, index) => (
            <TableRow
              key={line.id}
              data-state={lineSelection.isRowSelected(line.id) ? "selected" : undefined}
            >
              <TableCell>
                <Checkbox
                  checked={lineSelection.isRowSelected(line.id)}
                  onCheckedChange={(checked) =>
                    lineSelection.toggleRow(line.id, checked === true)
                  }
                  aria-label={`Select line ${line.serialNumber.serialNo}`}
                />
              </TableCell>
              <TableIndexCell index={index + 1} />
              <TableCell className="font-mono text-sm">{line.serialNumber.serialNo}</TableCell>
              <TableCell>
                <div>{line.model.skuCode}</div>
                <div className="text-muted-foreground text-xs">{line.model.name}</div>
              </TableCell>
              <TableCell>
                <Badge variant={line.expectedInCount ? "outline" : "secondary"}>
                  {line.expectedInCount ? "Expected" : "Surplus"}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{line.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col items-end gap-1">
                  {session.status === "in_progress" && line.status === "pending" && (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          () => recordStockCountLineAction(session.id, line.id),
                          "Unit recorded",
                        )
                      }
                    >
                      Mark counted
                    </Button>
                  )}
                  {canRecountStatuses.includes(session.status) &&
                    (line.status === "counted" || line.status === "variance") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          runAction(
                            () => recountStockCountLineAction(session.id, line.id),
                            "Line opened for recount",
                          )
                        }
                      >
                        Recount
                      </Button>
                    )}
                  {line.countedBy && (
                    <span className="text-muted-foreground text-xs">
                      {line.countedBy.name ?? line.countedBy.email}
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>

      {session.variances.length > 0 && (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Variance report</h3>
            <p className="text-muted-foreground text-sm">
              Investigate or reject differences, then Post differences to correct local stock
              and send an Inventory Posting to SAP when connected.
            </p>
          </div>
          <GlobalDataTable stickyHeader scrollable>
            <TableHeader>
              <TableRow>
                <GlobalTableHead className="w-10">
                  <Checkbox
                    checked={
                      varianceSelection.isAllSelected ||
                      (varianceSelection.isPartiallySelected ? "indeterminate" : false)
                    }
                    onCheckedChange={(checked) =>
                      varianceSelection.toggleAll(checked === true)
                    }
                    aria-label="Select all variances"
                  />
                </GlobalTableHead>
                <TableIndexHead />
                <GlobalTableHead {...varianceSort.sortProps("serial")}>
                  Serial / SKU
                </GlobalTableHead>
                <GlobalTableHead {...varianceSort.sortProps("type")}>Type</GlobalTableHead>
                <GlobalTableHead {...varianceSort.sortProps("status")}>Status</GlobalTableHead>
                <GlobalTableHead {...varianceSort.sortProps("sapRef")}>SAP ref</GlobalTableHead>
                <GlobalTableHead>Actions</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {varianceSort.sorted.map((v, index) => (
                <TableRow
                  key={v.id}
                  data-state={varianceSelection.isRowSelected(v.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={varianceSelection.isRowSelected(v.id)}
                      onCheckedChange={(checked) =>
                        varianceSelection.toggleRow(v.id, checked === true)
                      }
                      aria-label={`Select variance ${v.id}`}
                    />
                  </TableCell>
                  <TableIndexCell index={index + 1} />
                  <TableCell>
                    {v.line ? (
                      <>
                        <div className="font-mono text-sm">{v.line.serialNumber.serialNo}</div>
                        <div className="text-muted-foreground text-xs">{v.line.model.skuCode}</div>
                      </>
                    ) : (
                      "—"
                    )}
                    {v.description && (
                      <div className="text-muted-foreground mt-1 text-xs">{v.description}</div>
                    )}
                  </TableCell>
                  <TableCell>{v.varianceType}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{STOCK_VARIANCE_STATUS_LABELS[v.status]}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{v.sapDocRef ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      {["open", "investigating"].includes(v.status) && (
                        <>
                          <Input
                            placeholder="Investigation notes"
                            value={investigationNotes[v.id] ?? ""}
                            onChange={(e) =>
                              setInvestigationNotes((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                          />
                          {v.status === "open" && (
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                runAction(
                                  () =>
                                    investigateStockVarianceAction(v.id, {
                                      notes: investigationNotes[v.id] ?? "",
                                    }),
                                  "Investigation recorded",
                                )
                              }
                            >
                              Start investigation
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              runAction(
                                () =>
                                  rejectStockVarianceAction(v.id, {
                                    notes: investigationNotes[v.id],
                                  }),
                                "Variance rejected",
                              )
                            }
                          >
                            Reject
                          </Button>
                          {v.line && canRecountStatuses.includes(session.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                runAction(
                                  () => recountStockCountLineAction(session.id, v.line!.id),
                                  "Line opened for recount",
                                )
                              }
                            >
                              Recount line
                            </Button>
                          )}
                        </>
                      )}
                      {v.investigationNotes && (
                        <p className="text-muted-foreground text-xs">{v.investigationNotes}</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </GlobalDataTable>
        </>
      )}
      <StockCountPermissionDialog
        open={permissionDialogOpen}
        onOpenChange={setPermissionDialogOpen}
      />
    </div>
  );
}
