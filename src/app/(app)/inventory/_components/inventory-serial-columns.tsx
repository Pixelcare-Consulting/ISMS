"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";
import type { InventoryListItem } from "@/features/inventory/actions/inventory.actions";
import { InventoryUnitStatusCell } from "@/features/inventory/components/inventory-unit-status-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";

const serialHelper = createColumnHelper<DataTableFeatures, InventoryListItem>();

interface InventorySerialColumnOptions {
  indexOffset: number;
  includeBranch: boolean;
  includeModel: boolean;
  sortable: boolean;
  agingHeader?: string;
}

export function createInventorySerialColumns({
  indexOffset,
  includeBranch,
  includeModel,
  sortable,
  agingHeader = "Aging",
}: InventorySerialColumnOptions): DataTableColumn<InventoryListItem>[] {
  const columns: DataTableColumn<InventoryListItem>[] = [
    serialHelper.display({
      id: "index",
      header: "#",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => indexOffset + row.index + 1,
      meta: {
        mobile: "detail",
        className: "w-12 text-center tabular-nums text-muted-foreground",
      },
    }),
  ];

  if (includeBranch) {
    columns.push(
      serialHelper.accessor((row) => row.branch.name, {
        id: "branch",
        header: "Branch Name",
        enableSorting: sortable,
        cell: ({ row }) => (
          <span title={row.original.branch.name}>{row.original.branch.name}</span>
        ),
        meta: { wrap: true, mobile: "primary", className: "min-w-0" },
      }),
    );
  }

  if (includeModel) {
    columns.push(
      serialHelper.accessor((row) => row.serialNumber.model.sku, {
        id: "model",
        header: "Model",
        enableSorting: sortable,
        cell: ({ row }) => (
          <>
            <span className="block font-mono">{row.original.serialNumber.model.sku}</span>
            <span className="block text-xs text-muted-foreground">
              {row.original.serialNumber.model.name}
            </span>
          </>
        ),
        meta: { wrap: true, mobile: "primary", className: "min-w-0" },
      }),
    );
  }

  columns.push(
    serialHelper.accessor((row) => row.serialNumber.serialNo, {
      id: "serial",
      header: "Serial",
      enableSorting: sortable,
      cell: ({ row }) => (
        <InventorySerialIdentity
          serialId={row.original.serialNumber.id}
          serialNo={row.original.serialNumber.serialNo}
        />
      ),
      meta: { mobile: "primary", className: "min-w-0" },
    }),
    serialHelper.accessor((row) => row.deliveryNo ?? "", {
      id: "dr",
      header: "DR#",
      enableSorting: sortable,
      cell: ({ row }) => row.original.deliveryNo?.trim() || "—",
      meta: {
        wrap: true,
        mobile: "detail",
        className: "min-w-0 font-mono",
      },
    }),
    serialHelper.accessor((row) => row.deliveryDate ?? "", {
      id: "drDate",
      header: "DR date",
      enableSorting: sortable,
      cell: ({ row }) => formatInventoryDrDate(row.original.deliveryDate),
      meta: { mobile: "detail", className: "tabular-nums" },
    }),
    serialHelper.accessor((row) => row.onPlanogram, {
      id: "planogram",
      header: "Planogram",
      enableSorting: sortable,
      cell: ({ row }) => <InventoryPlanogramBadge onPlanogram={row.original.onPlanogram} />,
      meta: { mobile: "detail" },
    }),
    serialHelper.accessor((row) => row.agingDays, {
      id: "aging",
      header: agingHeader,
      enableSorting: sortable,
      cell: ({ row }) => row.original.agingDays,
      meta: { align: "end", mobile: "detail" },
    }),
    serialHelper.accessor((row) => row.statusCode.name, {
      id: "status",
      header: "Status",
      enableSorting: sortable,
      cell: ({ row }) => <InventoryUnitStatusCell row={row.original} />,
      meta: { mobile: "primary", className: "min-w-0" },
    }),
  );

  return columns;
}

export function InventorySerialIdentity({
  serialId,
  serialNo,
}: {
  serialId: string;
  serialNo: string;
}) {
  return (
    <span className="flex w-20 flex-col items-start gap-0.5 md:inline-flex md:w-auto md:flex-row md:items-center md:gap-1">
      <Link
        href={`/inventory/serial-numbers/${serialId}`}
        className="whitespace-normal break-all font-mono text-primary underline-offset-4 hover:underline md:whitespace-nowrap md:break-normal"
      >
        {serialNo}
      </Link>
      <CopySerialButton serialNo={serialNo} />
    </span>
  );
}

function CopySerialButton({ serialNo }: { serialNo: string }) {
  const [copied, setCopied] = useState(false);

  async function copySerial() {
    try {
      await navigator.clipboard.writeText(serialNo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy serial");
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 shrink-0"
      aria-label={copied ? `Copied serial ${serialNo}` : `Copy serial ${serialNo}`}
      onClick={() => {
        void copySerial();
      }}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </Button>
  );
}

function InventoryPlanogramBadge({ onPlanogram }: { onPlanogram: boolean }) {
  if (onPlanogram) {
    return (
      <Badge variant="outline" className="whitespace-nowrap border-green-600 text-green-700">
        On planogram
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="whitespace-nowrap border-amber-600 text-amber-700">
      Off planogram
    </Badge>
  );
}
