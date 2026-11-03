"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ORDER_SUMMARY_STATUS_GROUPS,
  ORDER_SUMMARY_STATUS_LABELS,
  type OrderSummaryStatusGroup,
} from "@/features/reports/constants/order-summary";
import {
  ORDER_SUMMARY_RANGE_LABELS,
  ORDER_SUMMARY_RANGE_PRESETS,
  orderSummaryRange,
  type OrderSummaryRangePreset,
} from "@/features/reports/lib/order-summary-range";
import { ReportPreview } from "@/features/reporting/components/report-preview";
import { describeDateRange } from "@/features/reporting/lib/filter-summary";
import type { DatasetParams } from "@/features/reporting/schemas/dataset-params.schema";

function statusSummary(groups: readonly OrderSummaryStatusGroup[]): string {
  if (groups.length === 0 || groups.length === ORDER_SUMMARY_STATUS_GROUPS.length) return "All statuses";
  return groups.map((group) => ORDER_SUMMARY_STATUS_LABELS[group]).join(", ");
}

/**
 * Every order request in a date range (created date, Manila), optionally narrowed by
 * status. The preview prints and exports (PDF, Excel) from the Stimulsoft viewer.
 */
export function OrderSummaryReportPanel() {
  const [preset, setPreset] = useState<OrderSummaryRangePreset>("TODAY");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statuses, setStatuses] = useState<OrderSummaryStatusGroup[]>([]);
  const [previewParams, setPreviewParams] = useState<DatasetParams | null>(null);
  const [error, setError] = useState<string | null>(null);

  function range(): { from: string; to: string } | null {
    if (preset !== "CUSTOM") return orderSummaryRange(preset);
    if (!customFrom) return null;
    const to = customTo || customFrom;
    return to < customFrom ? null : { from: customFrom, to };
  }

  function toggleStatus(group: OrderSummaryStatusGroup, checked: boolean) {
    setStatuses((current) =>
      checked ? [...current, group] : current.filter((value) => value !== group),
    );
  }

  function preview() {
    const dates = range();
    if (!dates) {
      setError("Pick a start date, and an end date on or after it.");
      return;
    }
    setError(null);
    setPreviewParams({
      from: dates.from,
      to: dates.to,
      ...(statuses.length > 0 ? { orderStatuses: statuses } : {}),
    });
  }

  const summary = previewParams
    ? `${describeDateRange(previewParams.from, previewParams.to)} · ${statusSummary(previewParams.orderStatuses ?? [])}`
    : "";

  return (
    <div className="space-y-4">
      <div className="max-w-2xl space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <p className="text-sm text-muted-foreground">
          Order requests created in the chosen dates (Philippine time), one row per order, with requested and
          approved quantities, amounts, and CBM. Print or export from the preview. Limited to your assigned
          branches.
        </p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Dates</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
            {ORDER_SUMMARY_RANGE_PRESETS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={preset === value ? "default" : "outline"}
                aria-pressed={preset === value}
                className="max-sm:h-11"
                onClick={() => setPreset(value)}
              >
                {ORDER_SUMMARY_RANGE_LABELS[value]}
              </Button>
            ))}
          </div>
          {preset === "CUSTOM" ? (
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="order-summary-from">From</Label>
                <Input
                  id="order-summary-from"
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-summary-to">To</Label>
                <Input
                  id="order-summary-to"
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {describeDateRange(orderSummaryRange(preset).from, orderSummaryRange(preset).to)}
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Status</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {ORDER_SUMMARY_STATUS_GROUPS.map((group) => (
              <label key={group} className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox
                  checked={statuses.includes(group)}
                  onCheckedChange={(value) => toggleStatus(group, value === true)}
                />
                {ORDER_SUMMARY_STATUS_LABELS[group]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Leave all unticked for every status. Drafts are never listed.</p>
        </fieldset>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" className="max-sm:h-11" onClick={preview}>
          Preview report
        </Button>
      </div>
      <ReportPreview
        reportKey="order-summary"
        params={previewParams}
        filterSummary={summary}
        onClose={() => setPreviewParams(null)}
      />
    </div>
  );
}
