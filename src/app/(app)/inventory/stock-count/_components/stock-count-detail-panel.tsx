"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  closeStockCountSessionAction,
  completeStockCountAction,
  investigateStockVarianceAction,
  recordStockCountLineAction,
  requestStockAdjustmentAction,
  startStockCountAction,
} from "@/features/stock-audit/actions/stock-audit.actions";
import {
  STOCK_COUNT_SESSION_LABELS,
  STOCK_VARIANCE_STATUS_LABELS,
} from "@/features/stock-audit/constants/stock-count-workflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";

interface StockCountDetailPanelProps {
  session: {
    id: string;
    sessionNo: string;
    status: keyof typeof STOCK_COUNT_SESSION_LABELS;
    branch: { name: string; sapCode: string };
    lines: {
      id: string;
      status: string;
      serialNumber: { serialNo: string };
      model: { skuCode: string; name: string; brand: { name: string } | null };
      countedBy: { name: string | null; email: string } | null;
    }[];
    variances: {
      id: string;
      varianceType: string;
      status: keyof typeof STOCK_VARIANCE_STATUS_LABELS;
      description: string | null;
      investigationNotes: string | null;
      sapDocRef: string | null;
      line: {
        serialNumber: { serialNo: string };
        model: { skuCode: string; name: string };
      } | null;
    }[];
  };
}

export function StockCountDetailPanel({ session }: StockCountDetailPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [investigationNotes, setInvestigationNotes] = useState<Record<string, string>>({});
  const lineSelection = useTableSelection(session.lines.map((line) => line.id));
  const varianceSelection = useTableSelection(session.variances.map((variance) => variance.id));

  function runAction(action: () => Promise<{ error?: string; success?: boolean }>, message: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      router.refresh();
    });
  }

  const pendingLines = session.lines.filter((l) => l.status === "pending").length;

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
                pendingLines > 0
                  ? `Counting complete — ${pendingLines} variance(s) opened`
                  : "Counting complete — no variances",
              )
            }
          >
            Complete counting
            {pendingLines > 0 ? ` (${pendingLines} unscanned)` : ""}
          </Button>
        )}
        {["counting_complete", "adjustment_requested", "closed"].includes(session.status) &&
          session.variances.every((v) => ["closed", "rejected"].includes(v.status)) && (
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

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Count lines</h3>
        <p className="text-muted-foreground text-sm">PS scans / records each expected unit.</p>
      </div>
      <DataTableShell>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={lineSelection.isAllSelected || (lineSelection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => lineSelection.toggleAll(checked === true)}
                    aria-label="Select all count lines"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {session.lines.map((line, index) => (
                <TableRow key={line.id} data-state={lineSelection.isRowSelected(line.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={lineSelection.isRowSelected(line.id)}
                      onCheckedChange={(checked) => lineSelection.toggleRow(line.id, checked === true)}
                      aria-label={`Select line ${line.serialNumber.serialNo}`}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-mono text-sm">{line.serialNumber.serialNo}</TableCell>
                  <TableCell>
                    <div>{line.model.skuCode}</div>
                    <div className="text-muted-foreground text-xs">{line.model.name}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{line.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
                        Record scan
                      </Button>
                    )}
                    {line.countedBy && (
                      <span className="text-muted-foreground text-xs">
                        {line.countedBy.name ?? line.countedBy.email}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>

      {session.variances.length > 0 && (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Variance report</h3>
            <p className="text-muted-foreground text-sm">
              TL investigates discrepancies; admin requests SAP inventory adjustment.
            </p>
          </div>
          <DataTableShell>
            <DataTableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={varianceSelection.isAllSelected || (varianceSelection.isPartiallySelected ? "indeterminate" : false)}
                      onCheckedChange={(checked) => varianceSelection.toggleAll(checked === true)}
                      aria-label="Select all variances"
                    />
                  </TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Serial / SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SAP ref</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.variances.map((v, index) => (
                  <TableRow key={v.id} data-state={varianceSelection.isRowSelected(v.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={varianceSelection.isRowSelected(v.id)}
                        onCheckedChange={(checked) => varianceSelection.toggleRow(v.id, checked === true)}
                        aria-label={`Select variance ${v.id}`}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
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
                      <Badge variant="outline">
                        {STOCK_VARIANCE_STATUS_LABELS[v.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{v.sapDocRef ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        {v.status === "open" && (
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
                          </>
                        )}
                        {v.status === "investigating" && (
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              runAction(
                                () => requestStockAdjustmentAction(v.id),
                                "Adjustment queued to SAP",
                              )
                            }
                          >
                            Request SAP adjustment
                          </Button>
                        )}
                        {v.investigationNotes && (
                          <p className="text-muted-foreground text-xs">{v.investigationNotes}</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableScroll>
        </DataTableShell>
        </>
      )}
    </div>
  );
}
