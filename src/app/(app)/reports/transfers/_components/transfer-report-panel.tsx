"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportTransferReportCsvAction } from "@/features/reports/actions/reports.actions";
import { downloadCsvFile } from "@/lib/shared/download-csv";

export function TransferReportPanel() {
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-6 shadow-sm">
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
      <Button disabled={pending} onClick={handleExport}>
        {pending ? "Exporting…" : "Download CSV"}
      </Button>
    </div>
  );
}
