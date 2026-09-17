"use client";

import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatHistoryWindowLabel } from "@/features/demand-planning/lib/history-window";
import { calendarMonthBoundsFromLabel } from "@/features/demand-planning/lib/planning-period-dates";
import type {
  DemandPlanningWizardBranch,
  DemandPlanningWizardDealer,
  DemandPlanningWizardPeriod,
} from "@/features/demand-planning/types/run.types";

import { WizardField, WizardFieldGrid, WizardReadonlyValue } from "./demand-planning-wizard-field";
import { WizardBranchPicker, WizardDealerPicker } from "./wizard-scope-pickers";

function periodStartDate(period: DemandPlanningWizardPeriod | undefined): Date | null {
  if (!period) return null;
  if (period.startDate) {
    const parsed = new Date(period.startDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return calendarMonthBoundsFromLabel(period.label)?.startDate ?? null;
}

export function WizardStepScope({
  periods,
  dealers,
  branches,
  periodId,
  name,
  dealerIds,
  branchIds,
  frequencyOverride,
  branchCaption,
  onPeriodId,
  onName,
  onDealerIds,
  onBranchIds,
  onFrequencyOverride,
}: {
  periods: DemandPlanningWizardPeriod[];
  dealers: DemandPlanningWizardDealer[];
  branches: DemandPlanningWizardBranch[];
  periodId: string;
  name: string;
  dealerIds: string[];
  branchIds: string[];
  frequencyOverride: number | null;
  branchCaption?: string;
  onPeriodId: (value: string) => void;
  onName: (value: string) => void;
  onDealerIds: (value: string[]) => void;
  onBranchIds: (value: string[]) => void;
  onFrequencyOverride: (value: number | null) => void;
}) {
  const dealerFilter = new Set(dealerIds);
  const scopedBranches =
    dealerIds.length === 0
      ? []
      : branches.filter((branch) => branch.dealerId && dealerFilter.has(branch.dealerId));
  const selectedPeriod = periods.find((period) => period.id === periodId);
  const historyStart = periodStartDate(selectedPeriod);
  const historyLabel = historyStart ? formatHistoryWindowLabel(historyStart) : "—";

  function filterBranchesToDealers(nextDealerIds: string[]) {
    if (nextDealerIds.length === 0) {
      onBranchIds([]);
      return;
    }
    const nextBranches = branches.filter(
      (branch) => branch.dealerId && nextDealerIds.includes(branch.dealerId),
    );
    onBranchIds(nextBranches.map((branch) => branch.id));
  }

  return (
    <WizardFieldGrid>
      <WizardField label="Run name" htmlFor="run-name">
        <Input
          id="run-name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="December national plan"
          maxLength={120}
        />
      </WizardField>

      <WizardField label="Sales period">
        <SearchableSelect
          options={periods.map((period) => ({
            id: period.id,
            label: period.isActive ? `${period.label} (active)` : period.label,
          }))}
          value={periodId}
          onChange={onPeriodId}
          placeholder={periods.length === 0 ? "No periods yet" : "Select period…"}
          searchPlaceholder="Search periods…"
          emptyMessage="Import an SFE forecast in Settings to create a period."
        />
      </WizardField>

      <WizardField
        label="History window"
        hint="Rolling average, excludes the current month"
      >
        <WizardReadonlyValue>{historyLabel}</WizardReadonlyValue>
      </WizardField>

      <WizardField label="Dealers in scope">
        <WizardDealerPicker
          dealers={dealers}
          dealerIds={dealerIds}
          onDealerIds={onDealerIds}
          onFilterBranches={filterBranchesToDealers}
        />
      </WizardField>

      <WizardField label="Branches in scope" hint={branchCaption}>
        <WizardBranchPicker
          branches={scopedBranches}
          branchIds={branchIds}
          onBranchIds={onBranchIds}
        />
      </WizardField>

      <WizardField
        label="Delivery frequency / month"
        htmlFor="frequency-override"
        hint="Blank uses each branch schedule. Filled value overrides the run."
      >
        <Input
          id="frequency-override"
          type="number"
          min={1}
          step={0.5}
          placeholder="Each branch schedule"
          value={frequencyOverride ?? ""}
          onChange={(event) => {
            const raw = event.target.value;
            if (!raw) {
              onFrequencyOverride(null);
              return;
            }
            const next = Number(raw);
            onFrequencyOverride(Number.isFinite(next) && next > 0 ? next : null);
          }}
        />
      </WizardField>
    </WizardFieldGrid>
  );
}
