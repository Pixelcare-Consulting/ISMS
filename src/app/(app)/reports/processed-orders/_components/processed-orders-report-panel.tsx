"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  exportProcessedOrdersCsvAction,
  listBranchesForReportsAction,
} from "@/features/reports/actions/reports.actions";
import { downloadCsvFile } from "@/lib/shared/download-csv";

export function ProcessedOrdersReportPanel() {
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState("");
  const [processedFrom, setProcessedFrom] = useState("");
  const [processedTo, setProcessedTo] = useState("");

  async function loadBranches() {
    const list = await listBranchesForReportsAction();
    setBranches(list);
    if (list[0]) setBranchId("");
  }

  function handleExport() {
    startTransition(async () => {
      const result = await exportProcessedOrdersCsvAction({
        processedFrom: processedFrom || undefined,
        processedTo: processedTo || undefined,
        branchId: branchId || undefined,
      });
      if (!("success" in result) || !result.success) {
        toast.error("Export failed");
        return;
      }
      downloadCsvFile(result.csv, result.filename);
      toast.success("Processed orders CSV downloaded");
    });
  }

  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <p className="text-sm text-muted-foreground">
        Export approved branch order lines matching the ISMS-v2 Processed Order Summary layout.
      </p>
      {branches.length === 0 ? (
        <Button type="button" variant="outline" onClick={loadBranches}>
          Load branches
        </Button>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="processed-from">Processed from</Label>
              <Input
                id="processed-from"
                type="date"
                value={processedFrom}
                onChange={(e) => setProcessedFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="processed-to">Processed to</Label>
              <Input
                id="processed-to"
                type="date"
                value={processedTo}
                onChange={(e) => setProcessedTo(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-filter">Branch (optional)</Label>
            <select
              id="branch-filter"
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
          <Button disabled={pending} onClick={handleExport}>
            {pending ? "Exporting…" : "Download CSV"}
          </Button>
        </>
      )}
    </div>
  );
}
