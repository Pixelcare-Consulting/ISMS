"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
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
import { Input } from "@/components/ui/input";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";

type CountLineRow = StockCountSessionDetailDto["lines"][number];
type VarianceRow = StockCountSessionDetailDto["variances"][number];

const lineColumn = createColumnHelper<DataTableFeatures, CountLineRow>();
const varianceColumn = createColumnHelper<DataTableFeatures, VarianceRow>();

interface StockCountDetailPanelProps {
  session: StockCountSessionDetailDto;
}

export function StockCountDetailPanel({ session }: StockCountDetailPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scanInput, setScanInput] = useState("");
  const [investigationNotes, setInvestigationNotes] = useState<Record<string, string>>({});
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [lineSelection, setLineSelection] = useState<RowSelectionState>({});
  const [varianceSelection, setVarianceSelection] = useState<RowSelectionState>({});

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

  const lineColumns = useMemo(() => {
    const cols: DataTableColumn<CountLineRow>[] = [
      lineColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      lineColumn.display({
        id: "serial",
        header: "Serial",
        enableSorting: true,
        cell: ({ row }) => row.original.serialNumber.serialNo,
        meta: { className: "font-mono text-sm" },
      }),
      lineColumn.display({
        id: "sku",
        header: "SKU",
        enableSorting: true,
        cell: ({ row }) => (
          <>
            <div>{row.original.model.skuCode}</div>
            <div className="text-xs text-muted-foreground">{row.original.model.name}</div>
          </>
        ),
      }),
      lineColumn.display({
        id: "expected",
        header: "Expected",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={row.original.expectedInCount ? "outline" : "secondary"}>
            {row.original.expectedInCount ? "Expected" : "Surplus"}
          </Badge>
        ),
      }),
      lineColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      }),
      lineColumn.display({
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original;
          return (
            <div className="flex flex-col items-end gap-1">
              {session.status === "in_progress" && line.status === "pending" ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    runAction(() => recordStockCountLineAction(session.id, line.id), "Unit recorded")
                  }
                >
                  Mark counted
                </Button>
              ) : null}
              {canRecountStatuses.includes(session.status) &&
              (line.status === "counted" || line.status === "variance") ? (
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
              ) : null}
              {line.countedBy ? (
                <span className="text-xs text-muted-foreground">
                  {line.countedBy.name ?? line.countedBy.email}
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [canRecountStatuses, pending, session.id, session.status]);

  const varianceColumns = useMemo(() => {
    const cols: DataTableColumn<VarianceRow>[] = [
      varianceColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      varianceColumn.display({
        id: "serial",
        header: "Serial / SKU",
        enableSorting: true,
        cell: ({ row }) => {
          const variance = row.original;
          return (
            <>
              {variance.line ? (
                <>
                  <div className="font-mono text-sm">{variance.line.serialNumber.serialNo}</div>
                  <div className="text-xs text-muted-foreground">{variance.line.model.skuCode}</div>
                </>
              ) : (
                "—"
              )}
              {variance.description ? (
                <div className="mt-1 text-xs text-muted-foreground">{variance.description}</div>
              ) : null}
            </>
          );
        },
        meta: { wrap: true },
      }),
      varianceColumn.display({
        id: "type",
        header: "Type",
        enableSorting: true,
        cell: ({ row }) => row.original.varianceType,
      }),
      varianceColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="outline">{STOCK_VARIANCE_STATUS_LABELS[row.original.status]}</Badge>
        ),
      }),
      varianceColumn.display({
        id: "sapRef",
        header: "SAP ref",
        enableSorting: true,
        cell: ({ row }) => row.original.sapDocRef ?? "—",
        meta: { className: "font-mono text-xs" },
      }),
      varianceColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const variance = row.original;
          return (
            <div className="flex flex-col gap-2">
              {["open", "investigating"].includes(variance.status) ? (
                <>
                  <Input
                    placeholder="Investigation notes"
                    value={investigationNotes[variance.id] ?? ""}
                    onChange={(event) =>
                      setInvestigationNotes((prev) => ({
                        ...prev,
                        [variance.id]: event.target.value,
                      }))
                    }
                  />
                  {variance.status === "open" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          () =>
                            investigateStockVarianceAction(variance.id, {
                              notes: investigationNotes[variance.id] ?? "",
                            }),
                          "Investigation recorded",
                        )
                      }
                    >
                      Start investigation
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      runAction(
                        () =>
                          rejectStockVarianceAction(variance.id, {
                            notes: investigationNotes[variance.id],
                          }),
                        "Variance rejected",
                      )
                    }
                  >
                    Reject
                  </Button>
                  {variance.line && canRecountStatuses.includes(session.status) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          () => recountStockCountLineAction(session.id, variance.line!.id),
                          "Line opened for recount",
                        )
                      }
                    >
                      Recount line
                    </Button>
                  ) : null}
                </>
              ) : null}
              {variance.investigationNotes ? (
                <p className="text-xs text-muted-foreground">{variance.investigationNotes}</p>
              ) : null}
            </div>
          );
        },
        meta: { wrap: true },
      }),
    ];
    return cols;
  }, [canRecountStatuses, investigationNotes, pending, session.id, session.status]);

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
      <DataTable
        data={lineSort.sorted}
        columns={lineColumns}
        getRowId={(row) => row.id}
        manualSorting
        enableSorting
        sorting={{
          sortKey: lineSort.sortKey,
          sortDir: lineSort.sortDir,
          onSort: lineSort.toggleSort,
        }}
        enableRowSelection
        rowSelection={lineSelection}
        onRowSelectionChange={setLineSelection}
        selectAllLabel="Select all count lines"
        getSelectionLabel={(row) => `Select line ${row.serialNumber.serialNo}`}
        stickyHeader
        empty={lineSort.sorted.length === 0}
        emptyMessage="No count lines."
      />

      {session.variances.length > 0 && (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Variance report</h3>
            <p className="text-muted-foreground text-sm">
              Investigate or reject differences, then Post differences to correct local stock
              and send an Inventory Posting to SAP when connected.
            </p>
          </div>
          <DataTable
            data={varianceSort.sorted}
            columns={varianceColumns}
            getRowId={(row) => row.id}
            manualSorting
            enableSorting
            sorting={{
              sortKey: varianceSort.sortKey,
              sortDir: varianceSort.sortDir,
              onSort: varianceSort.toggleSort,
            }}
            enableRowSelection
            rowSelection={varianceSelection}
            onRowSelectionChange={setVarianceSelection}
            selectAllLabel="Select all variances"
            getSelectionLabel={(row) => `Select variance ${row.id}`}
            stickyHeader
            empty={varianceSort.sorted.length === 0}
            emptyMessage="No variances."
          />
        </>
      )}
      <StockCountPermissionDialog
        open={permissionDialogOpen}
        onOpenChange={setPermissionDialogOpen}
      />
    </div>
  );
}
