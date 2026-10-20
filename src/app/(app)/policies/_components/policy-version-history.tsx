"use client";

import { useMemo, useState } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import {
  POLICY_STATUS_LABELS,
  type PolicyStatus,
} from "@/features/policies/constants/policy-status";

const versionColumn = createColumnHelper<DataTableFeatures, VersionRow>();

interface VersionRow {
  id: string;
  version: number;
  status: string;
  content: string;
  createdAt: Date;
  authorName: string;
}

interface PolicyVersionHistoryProps {
  versions: VersionRow[];
  selectedVersion: number;
  onSelectVersion: (version: number) => void;
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "review") return "secondary";
  return "outline";
}

export function PolicyVersionHistory({
  versions,
  selectedVersion,
  onSelectVersion,
}: PolicyVersionHistoryProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const sort = useClientTableSort(versions, {
    version: (row) => row.version,
    status: (row) => row.status,
    author: (row) => row.authorName,
    date: (row) => row.createdAt,
  });

  const columns = useMemo(() => {
    const cols: DataTableColumn<VersionRow>[] = [
      versionColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      versionColumn.display({
        id: "version",
        header: "Version",
        enableSorting: true,
        cell: ({ row }) => (
          <button
            type="button"
            className={row.original.version === selectedVersion ? "font-semibold" : "font-medium"}
            onClick={() => onSelectVersion(row.original.version)}
          >
            v{row.original.version}
          </button>
        ),
      }),
      versionColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <button type="button" onClick={() => onSelectVersion(row.original.version)}>
            <Badge variant={statusVariant(row.original.status)}>
              {POLICY_STATUS_LABELS[row.original.status as PolicyStatus] ?? row.original.status}
            </Badge>
          </button>
        ),
      }),
      versionColumn.display({
        id: "author",
        header: "Author",
        enableSorting: true,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-muted-foreground"
            onClick={() => onSelectVersion(row.original.version)}
          >
            {row.original.authorName}
          </button>
        ),
      }),
      versionColumn.display({
        id: "date",
        header: "Date",
        enableSorting: true,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-muted-foreground"
            onClick={() => onSelectVersion(row.original.version)}
          >
            {new Date(row.original.createdAt).toLocaleDateString()}
          </button>
        ),
      }),
    ];
    return cols;
  }, [onSelectVersion, selectedVersion]);

  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No versions recorded yet.</p>
    );
  }

  return (
    <DataTable
      data={sort.sorted}
      columns={columns}
      getRowId={(row) => row.id}
      manualSorting
      enableSorting
      sorting={{
        sortKey: sort.sortKey,
        sortDir: sort.sortDir,
        onSort: sort.toggleSort,
      }}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      selectAllLabel="Select all policy versions"
      getSelectionLabel={(row) => `Select version ${row.version}`}
      stickyHeader
    />
  );
}
