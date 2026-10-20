"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";

import type {
  PcountBranchRow,
  PcountDealerGroup,
} from "@/features/stock-audit/services/pcount-dashboard.service";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/utils/cn";

const branchColumn = createColumnHelper<DataTableFeatures, PcountBranchRow>();

interface PcountDealerGroupCardProps {
  group: PcountDealerGroup;
  onSelectBranch: (branchId: string) => void;
}

function ProgressBar({
  done,
  counting,
  total,
}: {
  done: number;
  counting: number;
  total: number;
}) {
  if (total <= 0) return null;
  const donePct = (done / total) * 100;
  const countingPct = (counting / total) * 100;
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${done} of ${total} branches done`}
    >
      <div className="h-full bg-emerald-500/80" style={{ width: `${donePct}%` }} />
      <div className="h-full bg-amber-400/80" style={{ width: `${countingPct}%` }} />
    </div>
  );
}

/** Solid row surfaces — low-opacity tints looked see-through on white cards. */
function statusTone(counting: string, posting: string, index: number): string {
  if (counting === "Closed" || posting === "Posted / N/A") {
    return "bg-emerald-50 dark:bg-emerald-950/50";
  }
  if (
    posting === "Ready to post" ||
    posting === "Posted · pending SAP" ||
    posting === "Under investigation"
  ) {
    return "bg-amber-50 dark:bg-amber-950/50";
  }
  if (counting === "Counting (open)" || counting === "Open (draft)") {
    return "bg-sky-50 dark:bg-sky-950/50";
  }
  if (counting === "Counted") {
    return "bg-emerald-50 dark:bg-emerald-950/40";
  }
  return index % 2 === 1 ? "bg-table-stripe" : "bg-card";
}

export function PcountDealerGroupCard({
  group,
  onSelectBranch,
}: PcountDealerGroupCardProps) {
  const columns = useMemo(() => {
    const cols: DataTableColumn<PcountBranchRow>[] = [
      branchColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      branchColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            className={cn(
              "w-full rounded-sm px-1 py-0.5 text-left",
              statusTone(row.original.counting, row.original.posting, row.index),
            )}
            onClick={() => onSelectBranch(row.original.branchId)}
          >
            <p className="truncate text-sm font-medium">{row.original.branchName}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {row.original.branchSapCode}
            </p>
          </button>
        ),
      }),
      branchColumn.display({
        id: "counting",
        header: "Counting",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="outline" className="whitespace-nowrap font-normal">
            {row.original.counting}
          </Badge>
        ),
      }),
      branchColumn.display({
        id: "posting",
        header: "Posting",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="outline" className="whitespace-nowrap font-normal">
            {row.original.posting}
          </Badge>
        ),
      }),
    ];
    return cols;
  }, [onSelectBranch]);

  const title =
    group.groupCode === group.groupName
      ? group.groupCode
      : `${group.groupCode} · ${group.groupName}`;

  return (
    <Card className="flex max-h-[28rem] flex-col overflow-hidden">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug">
            {title}
          </CardTitle>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {group.branchesDone} / {group.branchesActive}
          </Badge>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Month progress</span>
            <span>
              {group.branchesDone} done · {group.countingOpen} counting ·{" "}
              {group.notStarted} not started
            </span>
          </div>
          <ProgressBar
            done={group.branchesDone}
            counting={group.countingOpen}
            total={group.branchesActive}
          />
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 pb-2 pt-0">
        <DataTable
          chrome="plain"
          data={group.branches}
          columns={columns}
          getRowId={(row) => row.branchId}
          stickyHeader
          empty={group.branches.length === 0}
          emptyMessage="No branches in this group."
        />
      </CardContent>
    </Card>
  );
}
