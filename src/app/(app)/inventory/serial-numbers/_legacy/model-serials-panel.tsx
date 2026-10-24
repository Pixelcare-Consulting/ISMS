"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { Barcode } from "lucide-react";

import type { LookupRecordStatus } from "@prisma/client";

import {
  TableSearchBar,
  uniqueSearchSuggestions,
} from "@/components/data-table/table-search-bar";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { MODEL_SERIAL_PAGE_SIZE } from "@/features/serial-numbers/constants/model-serial-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface ModelSerialPanelRow {
  id: string;
  serialNo: string;
  recordStatus: LookupRecordStatus;
  branchCode: string | null;
  branchName: string | null;
  /** On-hand units of this model at the same branch. Null when the row has no branch. */
  branchQty: number | null;
  statusCode: { code: string; name: string; color?: string | null } | null;
}

export interface ModelSerialPageState {
  items: ModelSerialPanelRow[];
  total: number;
  page: number;
  totalPages: number;
  /** False until an on-hand read has included this model. */
  onHandRecorded: boolean;
  loading?: boolean;
}

const panelColumn = createColumnHelper<DataTableFeatures, ModelSerialPanelRow>();

interface ModelSerialsPanelProps {
  skuCode: string;
  modelName: string;
  page: ModelSerialPageState | "loading" | undefined;
  canManage: boolean;
  pending: boolean;
  onPageChange: (page: number) => void;
  onSearch: (query: string) => void;
  onEdit: (serial: ModelSerialPanelRow) => void;
  onToggleStatus: (serial: ModelSerialPanelRow) => void;
}

export function ModelSerialsPanel({
  skuCode,
  modelName,
  page,
  canManage,
  pending,
  onPageChange,
  onSearch,
  onEdit,
  onToggleStatus,
}: ModelSerialsPanelProps) {
  const [draft, setDraft] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const loaded = page !== "loading" && page !== undefined ? page : null;
  const count = loaded?.total ?? 0;
  const startIndex = loaded ? (loaded.page - 1) * MODEL_SERIAL_PAGE_SIZE : 0;

  const columns = useMemo(() => {
    const cols: DataTableColumn<ModelSerialPanelRow>[] = [
      panelColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => startIndex + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      panelColumn.display({
        id: "serial",
        header: "Serial no",
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/inventory/serial-numbers/${row.original.id}`}
            className="font-mono underline-offset-4 hover:underline"
          >
            {row.original.serialNo}
          </Link>
        ),
      }),
      panelColumn.display({
        id: "branchCode",
        header: "Branch code",
        enableSorting: false,
        cell: ({ row }) => row.original.branchCode ?? "—",
        meta: { className: "font-mono" },
      }),
      panelColumn.display({
        id: "branchName",
        header: "Branch name",
        enableSorting: false,
        cell: ({ row }) => row.original.branchName ?? "—",
      }),
      panelColumn.display({
        id: "qty",
        header: "Branch qty",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.branchQty == null ? "—" : row.original.branchQty.toLocaleString(),
        meta: { align: "end", className: "tabular-nums" },
      }),
      panelColumn.display({
        id: "status",
        header: "ISMS status",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.statusCode ? (
            <StatusCodeBadge
              code={row.original.statusCode.code}
              name={row.original.statusCode.name}
              color={row.original.statusCode.color}
            />
          ) : (
            "—"
          ),
      }),
      panelColumn.display({
        id: "record",
        header: "Record",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.recordStatus === "active" ? "default" : "secondary"}>
            {row.original.recordStatus === "active" ? "Active" : "Inactive"}
          </Badge>
        ),
      }),
    ];
    if (canManage) {
      cols.push(
        panelColumn.display({
          id: "actions",
          header: "Actions",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex justify-end gap-2 whitespace-nowrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || loaded?.loading}
                onClick={() => onEdit(row.original)}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || loaded?.loading}
                onClick={() => onToggleStatus(row.original)}
              >
                {row.original.recordStatus === "active" ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ),
          meta: { align: "end" },
        }),
      );
    }
    return cols;
  }, [canManage, loaded?.loading, onEdit, onToggleStatus, pending, startIndex]);

  const suggestions = useMemo(
    () =>
      loaded
        ? uniqueSearchSuggestions(
            loaded.items.map((row) => row.serialNo),
            loaded.items.map((row) => row.branchCode),
            loaded.items.map((row) => row.branchName),
          )
        : [],
    [loaded],
  );

  function applySearch(next: string) {
    const term = next.trim();
    setDraft(term);
    setAppliedQuery(term);
    onSearch(term);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applySearch(draft);
  }

  return (
    <div className="rounded-lg border border-border/80 border-l-[3px] border-l-primary/70 bg-muted/40 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Barcode className="size-3.5" aria-hidden />
          </span>
          <h4 className="text-sm font-semibold text-foreground">
            Serial numbers for {skuCode}
          </h4>
          <span className="text-xs text-muted-foreground">{modelName}</span>
        </div>
        {loaded?.onHandRecorded ? (
          <Badge variant="secondary" className="font-normal tabular-nums">
            {count.toLocaleString()}
          </Badge>
        ) : null}
        {loaded?.onHandRecorded ? (
          <form onSubmit={submitSearch} className="ml-auto flex w-full gap-2 sm:w-auto">
            <TableSearchBar
              value={draft}
              onChange={setDraft}
              placeholder="Search serial no., branch code, or name…"
              suggestions={suggestions}
              onSuggestionSelect={applySearch}
              className="bg-white sm:w-64"
            />
            <Button type="submit" size="sm" variant="outline" className="bg-white" disabled={loaded.loading}>
              Search
            </Button>
          </form>
        ) : null}
      </div>

      {loaded === null ? (
        <p className="rounded-md border border-dashed border-border/70 bg-background/60 px-3 py-2.5 text-sm text-muted-foreground">
          Loading serial numbers for {skuCode}…
        </p>
      ) : !loaded.onHandRecorded ? (
        <p className="rounded-md border border-dashed border-border/70 bg-white px-3 py-2.5 text-sm text-muted-foreground">
          On-hand stock for {skuCode} has not been recorded yet in ISMS, sync from SAP first for this model.
        </p>
      ) : count === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 bg-white px-3 py-2.5 text-sm text-muted-foreground">
          {appliedQuery
            ? `No serial numbers match “${appliedQuery}”.`
            : `No units of ${skuCode} are currently on hand.`}
        </p>
      ) : (
        <div className={cn(loaded.loading && "opacity-60")}>
          <DataTable
            chrome="plain"
            data={loaded.items}
            columns={columns}
            getRowId={(row) => row.id}
            manualPagination
            stickyHeader
            pagination={
              count > MODEL_SERIAL_PAGE_SIZE
                ? {
                    total: count,
                    page: loaded.page,
                    totalPages: loaded.totalPages,
                    itemLabel: "serial",
                    onPageChange,
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
