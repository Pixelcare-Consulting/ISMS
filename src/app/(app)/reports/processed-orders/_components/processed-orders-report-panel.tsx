"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportProcessedOrdersCsvAction } from "@/features/reports/actions/reports.actions";
import { downloadCsvFile } from "@/lib/shared/download-csv";

export function ProcessedOrdersReportPanel() {
  const [pending, startTransition] = useTransition();
  const [processedFrom, setProcessedFrom] = useState("");
  const [processedTo, setProcessedTo] = useState("");

  function handleExport() {
    startTransition(async () => {
      const result = await exportProcessedOrdersCsvAction({
        processedFrom: processedFrom || undefined,
        processedTo: processedTo || undefined,
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
        Export approved branch order lines matching the ISMS-v2 Processed Order Summary layout,
        scoped to your assigned branch(es).
      </p>
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
      <Button disabled={pending} onClick={handleExport}>
        {pending ? "Exporting…" : "Download CSV"}
      </Button>
    </div>
  );
}
