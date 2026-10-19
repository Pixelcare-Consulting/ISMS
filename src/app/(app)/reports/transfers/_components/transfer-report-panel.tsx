"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportTransferReportCsvAction } from "@/features/reports/actions/reports.actions";
import { ReportPreview } from "@/features/reporting/components/report-preview";
import { describeDateRange } from "@/features/reporting/lib/filter-summary";
import type { DatasetParams } from "@/features/reporting/schemas/dataset-params.schema";
import { downloadCsvFile } from "@/lib/shared/download-csv";

export function TransferReportPanel() {
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [previewParams, setPreviewParams] = useState<DatasetParams | null>(null);

  function handleExport() {
    startTransition(async () => {
      const result = await exportTransferReportCsvAction({
        from: from || undefined,
        to: to || undefined,
      });
      if (!("success" in result) || !result.success) {
        toast.error("Export failed");
        return;
      }
      downloadCsvFile(result.csv, result.filename);
      toast.success("Transfer report CSV downloaded");
    });
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xl space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="transfer-from">From date</Label>
            <Input id="transfer-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-to">To date</Label>
            <Input id="transfer-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={handleExport}>
            {pending ? "Exporting…" : "Download CSV"}
          </Button>
          <Button variant="outline" onClick={() => setPreviewParams({ from: from || undefined, to: to || undefined })}>
            Preview report
          </Button>
        </div>
      </div>
      <ReportPreview reportKey="transfers" params={previewParams} filterSummary={describeDateRange(previewParams?.from, previewParams?.to)} onClose={() => setPreviewParams(null)} />
    </div>
  );
}
