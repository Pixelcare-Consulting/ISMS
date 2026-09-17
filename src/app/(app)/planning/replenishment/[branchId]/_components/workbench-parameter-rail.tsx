"use client";

import { useRouter } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MONTH_BASIS_DAYS } from "@/features/demand-planning";
import type { DemandPlanQuotaMode } from "@/features/demand-planning";
import { formatDemandDays, formatDemandPeso } from "@/features/demand-planning/lib/format-demand-plan";

export function WorkbenchParameterRail({
  branchLabel,
  periods,
  periodId,
  periodLabel,
  dropsPerMonth,
  scheduleDropsPerMonth,
  quotaMode,
  quotaPeso,
  readOnly,
  onPeriodChange,
  onDropsPerMonth,
  onQuotaMode,
  onQuotaPeso,
}: {
  branchLabel: string;
  periods: Array<{ id: string; label: string; isActive: boolean }>;
  periodId: string;
  periodLabel: string;
  dropsPerMonth: number;
  scheduleDropsPerMonth: number;
  quotaMode: DemandPlanQuotaMode;
  quotaPeso: number;
  readOnly: boolean;
  onPeriodChange: (periodId: string) => void;
  onDropsPerMonth: (value: number) => void;
  onQuotaMode: (value: DemandPlanQuotaMode) => void;
  onQuotaPeso: (value: number) => void;
}) {
  const router = useRouter();
  const deriveFromForecast = quotaMode === "derive_from_forecast";
  const minDays = dropsPerMonth > 0 ? MONTH_BASIS_DAYS / dropsPerMonth : MONTH_BASIS_DAYS / 4;

  return (
    <aside className="space-y-5 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-medium">{branchLabel}</p>
        <p className="text-xs text-muted-foreground">{periodLabel} live workbench</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workbench-period">Period</Label>
        <SearchableSelect
          id="workbench-period"
          className="w-full"
          options={periods.map((period) => ({
            id: period.id,
            label: period.isActive ? `${period.label} (active)` : period.label,
          }))}
          value={periodId}
          onChange={(next) => {
            if (!next || next === periodId) return;
            onPeriodChange(next);
            router.refresh();
          }}
          placeholder="Planning period"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workbench-frequency">Frequency (drops / month)</Label>
        <Input
          id="workbench-frequency"
          type="number"
          min={1}
          step={0.5}
          disabled={readOnly}
          value={dropsPerMonth}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next) && next > 0) onDropsPerMonth(next);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Min days (read-only): {formatDemandDays(minDays)} on a {MONTH_BASIS_DAYS}-day month.
          Branch schedule is {scheduleDropsPerMonth} drops/month.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workbench-quota">Quota</Label>
        <Input
          id="workbench-quota"
          type="number"
          min={0}
          step={1000}
          disabled={readOnly || deriveFromForecast}
          value={deriveFromForecast ? "" : quotaPeso}
          placeholder={deriveFromForecast ? "From forecast ₱" : undefined}
          onChange={(event) => {
            const next = Number(event.target.value);
            onQuotaPeso(Number.isFinite(next) && next >= 0 ? next : 0);
          }}
        />
        <p className="text-xs text-muted-foreground">
          {deriveFromForecast
            ? "Quota follows the live SKU forecast ₱."
            : `Branch target ${formatDemandPeso(quotaPeso)}.`}
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={deriveFromForecast}
          disabled={readOnly}
          onCheckedChange={(value) =>
            onQuotaMode(value === true ? "derive_from_forecast" : "branch_target")
          }
          className="mt-0.5"
        />
        <span>
          Derive from forecast
          <span className="block text-xs text-muted-foreground">
            Uncheck to type a branch quota ₱. Changing frequency, quota, DU, or FC recomputes Drop 1
            live — nothing is saved until you send.
          </span>
        </span>
      </label>
    </aside>
  );
}
