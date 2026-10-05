"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createStockCountSessionAction,
  postStockCountDifferencesAction,
} from "@/features/stock-audit/actions/stock-audit.actions";
import type { PcountBranchDetail } from "@/features/stock-audit/services/pcount-dashboard.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PcountBranchDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: PcountBranchDetail | null;
  canManage: boolean;
  loading?: boolean;
}

function formatManilaDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(",", "");
}

export function PcountBranchDetailSheet({
  open,
  onOpenChange,
  detail,
  canManage,
  loading,
}: PcountBranchDetailSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [localError, setLocalError] = useState<string | null>(null);

  const handlePost = () => {
    if (!detail?.latestSessionId || !detail.canPostDifferences) return;
    setLocalError(null);
    startTransition(async () => {
      const result = await postStockCountDifferencesAction(detail.latestSessionId!);
      if ("error" in result && result.error) {
        setLocalError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Differences posted");
      onOpenChange(false);
      router.refresh();
    });
  };

  const handleNewSession = () => {
    if (!detail) return;
    setLocalError(null);
    startTransition(async () => {
      const result = await createStockCountSessionAction({ branchId: detail.branchId });
      if ("error" in result && result.error) {
        setLocalError(result.error);
        toast.error(result.error);
        return;
      }
      if (result.sessionId) {
        toast.success("Count session created");
        router.push(`/inventory/stock-count/${result.sessionId}`);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
          <SheetTitle className="pr-8 text-base leading-snug">
            {detail ? detail.branchName : "Branch detail"}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {detail?.branchSapCode ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {loading && !detail ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}

          {detail ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Last count by
                  </p>
                  <p className="mt-1 truncate text-sm font-medium">
                    {detail.lastCountByName ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Last closed at
                  </p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {formatManilaDateTime(detail.lastClosedAt)}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Current posting
                  </p>
                  <p className="mt-1 text-sm font-medium">{detail.currentPosting}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {detail.latestSessionId ? (
                  <Button asChild size="sm">
                    <Link href={`/inventory/stock-count/${detail.latestSessionId}`}>
                      Open latest session
                    </Link>
                  </Button>
                ) : null}
                {canManage && detail.canPostDifferences && detail.latestSessionId ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={handlePost}
                  >
                    Post differences
                  </Button>
                ) : null}
                {canManage && !detail.latestSessionId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={handleNewSession}
                  >
                    New session
                  </Button>
                ) : null}
                {canManage && detail.latestSessionId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/inventory/stock-count">Sessions list</Link>
                  </Button>
                ) : null}
              </div>

              {localError ? (
                <p className="text-sm text-destructive">{localError}</p>
              ) : null}

              <div>
                <h3 className="mb-2 text-sm font-semibold">Session history</h3>
                {detail.sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No count sessions for this branch yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border bg-card">
                    <Table scrollContainer={false}>
                      <TableHeader>
                        <TableRow className="border-b bg-muted hover:bg-muted">
                          <TableHead className="bg-muted">Session</TableHead>
                          <TableHead className="bg-muted">By</TableHead>
                          <TableHead className="bg-muted">Counting</TableHead>
                          <TableHead className="bg-muted">Posting</TableHead>
                          <TableHead className="bg-muted">Closed</TableHead>
                          <TableHead className="bg-muted">SAP doc</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.sessions.map((session, index) => (
                          <TableRow
                            key={session.id}
                            className={
                              index % 2 === 1 ? "bg-table-stripe" : "bg-card"
                            }
                          >
                            <TableCell>
                              <Link
                                href={`/inventory/stock-count/${session.id}`}
                                className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                              >
                                {session.sessionNo}
                              </Link>
                            </TableCell>
                            <TableCell className="max-w-[7rem] truncate text-xs">
                              {session.createdByName ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="whitespace-nowrap font-normal">
                                {session.counting}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="whitespace-nowrap font-normal">
                                {session.posting}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs tabular-nums">
                              {formatManilaDateTime(session.closedAt)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {session.sapDocRef ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
