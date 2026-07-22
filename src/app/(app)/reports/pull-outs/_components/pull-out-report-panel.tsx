"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PullOutReportPanel() {
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function handleExport() {
    startTransition(() => {
      toast.info("CSV export not yet connected.");
    });
  }

  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pull-out-from">From date</Label>
          <Input
            id="pull-out-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pull-out-to">To date</Label>
          <Input
            id="pull-out-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <Button disabled={pending} onClick={handleExport}>
        {pending ? "Exporting…" : "Download CSV"}
      </Button>
    </div>
  );
}
