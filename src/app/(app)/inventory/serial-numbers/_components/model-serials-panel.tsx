"use client";

import { useState } from "react";
import Link from "next/link";
import { Barcode } from "lucide-react";

import type { LookupRecordStatus } from "@prisma/client";

import { TablePagination } from "@/components/data-table/table-pagination";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { MODEL_SERIAL_PAGE_SIZE } from "@/features/serial-numbers/constants/model-serial-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    setAppliedQuery(next);
    onSearch(next);
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
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search serial no., branch code, or name…"
              aria-label="Search serial number, branch code, or branch name"
              className="h-8 bg-white sm:w-64"
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
          On-hand stock for {skuCode} has not been recorded yet.
        </p>
      ) : count === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 bg-white px-3 py-2.5 text-sm text-muted-foreground">
          {appliedQuery
            ? `No serial numbers match “${appliedQuery}”.`
            : `No units of ${skuCode} are currently on hand.`}
        </p>
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-md border border-border/70 bg-white",
            loaded.loading && "opacity-60",
          )}
        >
          <table className="w-full border-separate border-spacing-0 text-sm">
            <colgroup>
              <col className="w-12" />
              <col />
              <col className="w-28" />
              <col />
              <col className="w-24" />
              <col className="w-36" />
              <col className="w-28" />
              {canManage ? <col className="w-48" /> : null}
            </colgroup>
            <thead>
              <tr className="bg-muted/40 text-xs font-medium text-muted-foreground">
                <th className="border-b border-border/70 px-3 py-2 text-center align-middle font-medium">
                  #
                </th>
                <th className="border-b border-border/70 px-3 py-2 text-left align-middle font-medium">
                  Serial no
                </th>
                <th className="border-b border-border/70 px-3 py-2 text-left align-middle font-medium">
                  Branch code
                </th>
                <th className="border-b border-border/70 px-3 py-2 text-left align-middle font-medium">
                  Branch name
                </th>
                <th className="border-b border-border/70 px-3 py-2 text-right align-middle font-medium">
                  Branch qty
                </th>
                <th className="border-b border-border/70 px-3 py-2 text-left align-middle font-medium">
                  ISMS status
                </th>
                <th className="border-b border-border/70 px-3 py-2 text-left align-middle font-medium">
                  Record
                </th>
                {canManage ? (
                  <th className="border-b border-border/70 px-3 py-2 text-right align-middle font-medium">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loaded.items.map((serial, index) => (
                <tr key={serial.id} className="bg-white last:[&>td]:border-b-0">
                  <td className="border-b border-border/60 px-3 py-2.5 text-center align-middle tabular-nums text-muted-foreground">
                    {startIndex + index + 1}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-left align-middle">
                    <Link
                      href={`/inventory/serial-numbers/${serial.id}`}
                      className="font-mono text-foreground underline-offset-4 hover:underline"
                    >
                      {serial.serialNo}
                    </Link>
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-left align-middle font-mono text-foreground">
                    {serial.branchCode ?? "—"}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-left align-middle text-foreground">
                    {serial.branchName ?? "—"}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right align-middle tabular-nums text-foreground">
                    {serial.branchQty == null ? "—" : serial.branchQty.toLocaleString()}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-left align-middle">
                    {serial.statusCode ? (
                      <StatusCodeBadge
                        code={serial.statusCode.code}
                        name={serial.statusCode.name}
                        color={serial.statusCode.color}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-left align-middle">
                    <Badge variant={serial.recordStatus === "active" ? "default" : "secondary"}>
                      {serial.recordStatus === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  {canManage ? (
                    <td className="border-b border-border/60 px-3 py-2.5 text-right align-middle">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending || loaded.loading}
                          onClick={() => onEdit(serial)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending || loaded.loading}
                          onClick={() => onToggleStatus(serial)}
                        >
                          {serial.recordStatus === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {count > MODEL_SERIAL_PAGE_SIZE ? (
            <TablePagination
              total={count}
              page={loaded.page}
              totalPages={loaded.totalPages}
              label="serial"
              onPageChange={onPageChange}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
