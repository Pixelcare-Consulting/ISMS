"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  exportDailyStockCsvAction,
  listBranchesForReportsAction,
} from "@/features/reports/actions/reports.actions";
import { downloadCsvFile } from "@/lib/shared/download-csv";

export function DailyStockReportPanel() {
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  async function loadBranches() {
    const list = await listBranchesForReportsAction();
    setBranches(list);
  }

  function handleExport() {
    startTransition(async () => {
      const result = await exportDailyStockCsvAction({
        date,
        branchId: branchId || undefined,
      });
      if (!("success" in result) || !result.success) {
        toast.error(result.error ?? "Export failed");
        return;
      }
      downloadCsvFile(result.csv, result.filename);
      toast.success("Daily stock CSV downloaded");
    });
  }

  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <p className="text-sm text-muted-foreground">
        Branch × planogram SKU matrix with INV (STK) and SOLD (SLD) counts for the selected day.
      </p>
      {branches.length === 0 ? (
        <Button type="button" variant="outline" onClick={loadBranches}>
          Load branches
        </Button>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="stock-date">Date</Label>
            <Input
              id="stock-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <SearchableSelect
            label="Branch (optional)"
            id="stock-branch"
            options={branches.map((b) => ({ id: b.id, label: b.name }))}
            value={branchId}
            onChange={setBranchId}
            allowClear
            placeholder="All branches"
            searchPlaceholder="Search branches…"
          />
          <Button disabled={pending || !date} onClick={handleExport}>
            {pending ? "Exporting…" : "Download CSV"}
          </Button>
        </>
      )}
    </div>
  );
}
