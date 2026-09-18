"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type DemandPlanQuotaMode } from "@/features/demand-planning";
import { formatDemandPeso } from "@/features/demand-planning/lib/format-demand-plan";

import { WizardField, WizardFieldGrid, WizardReadonlyValue } from "./demand-planning-wizard-field";

export function WizardStepParameters({
  quotaMode,
  frequencyOverride,
  monthBasisDays,
  roundUpToOne,
  floorAllocationAtZero,
  minLevelPeso,
  onQuotaMode,
  onMonthBasisDays,
  onRoundUpToOne,
  onFloorAllocationAtZero,
}: {
  quotaMode: DemandPlanQuotaMode;
  frequencyOverride: number | null;
  monthBasisDays: number;
  roundUpToOne: boolean;
  floorAllocationAtZero: boolean;
  minLevelPeso: number | null;
  onQuotaMode: (value: DemandPlanQuotaMode) => void;
  onMonthBasisDays: (value: number) => void;
  onRoundUpToOne: (value: boolean) => void;
  onFloorAllocationAtZero: (value: boolean) => void;
}) {
  const deriveFromForecast = quotaMode === "derive_from_forecast";
  const drops = frequencyOverride;
  const basis =
    Number.isFinite(monthBasisDays) && monthBasisDays > 0 ? monthBasisDays : 30.5;
  const minDays = drops && drops > 0 ? basis / drops : null;

  return (
    <div className="space-y-5">
      <WizardFieldGrid>
        <WizardField
          label="Quota ₱"
          htmlFor="quota-peso"
          hint={
            deriveFromForecast
              ? "Taken from the SFE forecast total"
              : "Uses each branch revenue target"
          }
        >
          <Input
            id="quota-peso"
            disabled
            placeholder={deriveFromForecast ? "From SFE forecast" : "Branch revenue targets"}
            value=""
          />
        </WizardField>

        <WizardField
          label="Min level (days)"
          hint={drops ? `${basis} ÷ ${drops}` : `${basis} ÷ each branch frequency`}
        >
          <WizardReadonlyValue>
            {minDays != null ? minDays.toFixed(1) : "Per branch schedule"}
          </WizardReadonlyValue>
        </WizardField>

        <WizardField label="Min level value ₱">
          <WizardReadonlyValue>
            {minLevelPeso != null ? formatDemandPeso(minLevelPeso) : "After sources"}
          </WizardReadonlyValue>
        </WizardField>

        <WizardField
          label="Month basis (days)"
          htmlFor="month-basis-days"
          hint="Used for min level and days-of-inventory math"
        >
          <Input
            id="month-basis-days"
            type="number"
            min={1}
            step={0.1}
            value={Number.isFinite(monthBasisDays) ? monthBasisDays : ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next > 0) onMonthBasisDays(next);
            }}
          />
        </WizardField>

        <WizardField label="Rounding on slow movers">
          <Select
            value={roundUpToOne ? "up" : "none"}
            onValueChange={(value) => onRoundUpToOne(value === "up")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="up">Round up to 1</SelectItem>
              <SelectItem value="none">Do not round up</SelectItem>
            </SelectContent>
          </Select>
        </WizardField>

        <WizardField label="Floor allocation at zero">
          <Select
            value={floorAllocationAtZero ? "yes" : "allow"}
            onValueChange={(value) => onFloorAllocationAtZero(value === "yes")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes — never negative</SelectItem>
              <SelectItem value="allow">Allow negative</SelectItem>
            </SelectContent>
          </Select>
        </WizardField>
      </WizardFieldGrid>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={deriveFromForecast}
          onCheckedChange={(value) =>
            onQuotaMode(value === true ? "derive_from_forecast" : "branch_target")
          }
          className="mt-0.5"
        />
        <span>
          Derive quota from the SFE forecast total
          <span className="block text-xs text-muted-foreground">
            Uncheck to use each branch revenue target as the quota.
          </span>
        </span>
      </label>
    </div>
  );
}
