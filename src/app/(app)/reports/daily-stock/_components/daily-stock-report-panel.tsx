"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-6 shadow-sm">
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
          <div className="space-y-2">
            <Label htmlFor="stock-branch">Branch (optional)</Label>
            <select
              id="stock-branch"
              className="flex h-9 w-full rounded-md border px-2 text-sm"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <Button disabled={pending || !date} onClick={handleExport}>
            {pending ? "Exporting…" : "Download CSV"}
          </Button>
        </>
      )}
    </div>
  );
}
