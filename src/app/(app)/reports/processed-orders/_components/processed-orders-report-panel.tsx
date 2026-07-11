"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
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
          <SearchableSelect
            label="Branch (optional)"
            id="branch-filter"
            options={branches.map((b) => ({ id: b.id, label: b.name }))}
            value={branchId}
            onChange={setBranchId}
            allowClear
            placeholder="All branches"
            searchPlaceholder="Search branches…"
          />
          <Button disabled={pending} onClick={handleExport}>
            {pending ? "Exporting…" : "Download CSV"}
          </Button>
        </>
      )}
    </div>
  );
}
