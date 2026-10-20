"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CUSTOM_DASHBOARD_PERIOD_LABELS,
  CUSTOM_DASHBOARD_PERIODS,
  type CustomDashboardPeriod,
} from "@/features/custom-dashboards/schemas/custom-dashboard.schema";

/** "CUSTOM" is viewer-only: explicit dates that are never saved. */
export type DashboardPeriodChoice = CustomDashboardPeriod | "CUSTOM";

interface DashboardPeriodSelectProps<T extends DashboardPeriodChoice> {
  id: string;
  value: T;
  onChange: (value: T) => void;
  /** Adds a "Custom dates" option after the presets. */
  allowCustom?: boolean;
  disabled?: boolean;
}

export function DashboardPeriodSelect<T extends DashboardPeriodChoice>({
  id,
  value,
  onChange,
  allowCustom = false,
  disabled,
}: DashboardPeriodSelectProps<T>) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
      <SelectTrigger id={id} className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CUSTOM_DASHBOARD_PERIODS.map((period) => (
          <SelectItem key={period} value={period}>
            {CUSTOM_DASHBOARD_PERIOD_LABELS[period]}
          </SelectItem>
        ))}
        {allowCustom ? <SelectItem value="CUSTOM">Custom dates</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}
