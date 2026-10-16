"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  exportInventoryReportXlsxAction,
  listInventoryReportBranchesAction,
  listInventoryReportStatusOptionsAction,
} from "@/features/reports/actions/reports.actions";

const DEFAULT_STATUS_CODES = ["STK"];

type BranchOption = { id: string; name: string };
type StatusOption = { id: string; code: string; name: string };

function downloadWorkbook(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function InventoryReportPanel() {
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sku, setSku] = useState("");
  const [statusCodes, setStatusCodes] = useState<string[]>(DEFAULT_STATUS_CODES);
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [refsLoaded, setRefsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [branchRows, statusRows] = await Promise.all([
        listInventoryReportBranchesAction(),
        listInventoryReportStatusOptionsAction(),
      ]);
      if (cancelled) return;
      setBranches(branchRows);
      setStatusOptions(statusRows);
      setRefsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleExport() {
    startTransition(async () => {
      const result = await exportInventoryReportXlsxAction({
        from: from || undefined,
        to: to || undefined,
        sku: sku.trim() || undefined,
        // Empty selection = all statuses (explicit empty array).
        statusCodes,
        branchId: branchId || undefined,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("success" in result) || !result.success || !result.base64) {
        toast.error("Export failed");
        return;
      }
      downloadWorkbook(result.base64, result.filename);
      toast.success("Excel downloaded");
    });
  }

  const statusSelectOptions = statusOptions.map((s) => ({
    id: s.code,
    label: s.code === s.name ? s.code : `${s.code} — ${s.name}`,
  }));

  const branchSelectOptions = branches.map((b) => ({
    id: b.id,
    label: b.name,
  }));

  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <p className="text-sm text-muted-foreground">
        Branch stock units with dealer classification and delivery validation
        columns (serial, status, DR#, aging). Excel includes a Summary sheet of
        quantities and a Detail sheet of serials. Date filter uses DR date when
        present, otherwise last inventory update. Scoped to your assigned
        branch(es).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="inventory-from">From date</Label>
          <Input
            id="inventory-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-to">To date</Label>
          <Input
            id="inventory-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="inventory-sku">SKU contains</Label>
        <Input
          id="inventory-sku"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="e.g. SWS-01"
          autoComplete="off"
        />
      </div>
      <SearchableMultiSelect
        label="Status"
        options={statusSelectOptions}
        selectedIds={statusCodes}
        onChange={setStatusCodes}
        placeholder={refsLoaded ? "All statuses" : "Loading…"}
        searchPlaceholder="Search status…"
        emptyMessage="No status codes."
        hint="Default STK. Clear selection for all statuses."
        disabled={!refsLoaded}
      />
      <SearchableSelect
        label="Branch (optional)"
        options={branchSelectOptions}
        value={branchId}
        onChange={setBranchId}
        placeholder={refsLoaded ? "All assigned branches" : "Loading…"}
        searchPlaceholder="Search branch…"
        emptyMessage="No branches in your AOR."
        allowClear
        disabled={!refsLoaded}
      />
      <Button disabled={pending || !refsLoaded} onClick={handleExport}>
        {pending ? "Exporting…" : "Export"}
      </Button>
    </div>
  );
}
