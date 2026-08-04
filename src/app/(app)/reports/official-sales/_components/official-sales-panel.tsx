"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  clearOfficialSalesTempAction,
  processOfficialSalesAction,
  uploadOfficialSalesAction,
} from "@/features/official-sales/actions/official-sales.actions";
import {
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

export interface OfficialSalesStagingRow {
  id: string;
  serial: string;
  drDate: string | null;
  drNo: string | null;
  result: string | null;
  status: "pending" | "success" | "error";
  processedAt: string | null;
  batchFileName: string | null;
  createdAt: string;
}

interface OfficialSalesPanelProps {
  rows: OfficialSalesStagingRow[];
  canManage: boolean;
}

const COL_COUNT = 6;

export function OfficialSalesPanel({ rows, canManage }: OfficialSalesPanelProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.serial,
          row.drDate ?? "",
          row.drNo ?? "",
          row.result ?? "",
          row.status,
        ]),
      ),
    [rows, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((r) => r.serial),
        rows.map((r) => r.drNo),
      ),
    [rows],
  );

  const rowSort = useClientTableSort(filtered, {
    serial: (r) => r.serial,
    drDate: (r) => r.drDate,
    drNo: (r) => r.drNo,
    status: (r) => r.status,
    result: (r) => r.result,
  });

  function onUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadOfficialSalesAction(formData);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("rowCount" in result)) return;
      toast.success(`Uploaded ${result.rowCount} row(s)`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function onClear() {
    startTransition(async () => {
      const result = await clearOfficialSalesTempAction();
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("deleted" in result)) return;
      toast.success(`Cleared ${result.deleted} pending row(s)`);
      router.refresh();
    });
  }

  function onProcess(rowIds?: string[]) {
    startTransition(async () => {
      const result = await processOfficialSalesAction(
        rowIds?.length ? { rowIds } : undefined,
      );
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("processed" in result) || !("successCount" in result)) return;
      toast.success(
        `Processed ${result.processed}: ${result.successCount} ok, ${result.errorCount} failed`,
      );
      router.refresh();
    });
  }

  return (
    <GlobalDataTable
      stickyHeader
      scrollable
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search staging rows…",
        suggestions,
      }}
      toolbarActions={
        canManage ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => onUpload(e.target.files)}
            />
            <Button type="button" disabled={pending} onClick={() => fileRef.current?.click()}>
              Upload sales
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onProcess()}>
              Process pending
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={onClear}>
              Clear temp table
            </Button>
          </>
        ) : null
      }
      footer={
        rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Temp table is empty. Upload an Excel or CSV file to stage rows.
          </p>
        ) : null
      }
    >
      {rows.length > 0 ? (
        <>
          <TableHeader>
            <TableRow>
              <TableIndexHead />
              <GlobalTableHead {...rowSort.sortProps("serial")}>Serial</GlobalTableHead>
              <GlobalTableHead {...rowSort.sortProps("drDate")}>DR DATE</GlobalTableHead>
              <GlobalTableHead {...rowSort.sortProps("drNo")}>DR NO</GlobalTableHead>
              <GlobalTableHead>ACTION</GlobalTableHead>
              <GlobalTableHead {...rowSort.sortProps("result")}>RESULT</GlobalTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowSort.sorted.length === 0 ? (
              <TableEmptyRow colSpan={COL_COUNT} message="No results match your search." />
            ) : (
              rowSort.sorted.map((row, index) => (
                <TableRow key={row.id} className={cn(index % 2 === 1 && "bg-table-stripe")}>
                  <TableIndexCell index={index + 1} />
                  <TableCell className="font-mono text-sm">{row.serial}</TableCell>
                  <TableCell className="tabular-nums">{row.drDate ?? "—"}</TableCell>
                  <TableCell>{row.drNo ?? "—"}</TableCell>
                  <TableCell>
                    {canManage && row.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onProcess([row.id])}
                      >
                        Process
                      </Button>
                    ) : (
                      <span className="text-xs uppercase text-muted-foreground">{row.status}</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {row.result ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </>
      ) : null}
    </GlobalDataTable>
  );
}
