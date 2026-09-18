"use client";

import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { displayPeriodLabel } from "@/features/demand-planning/lib/planning-period-dates";
import type {
  DemandPlanningWizardBranch,
  DemandPlanningWizardDealer,
  DemandPlanningWizardPeriod,
} from "@/features/demand-planning/types/run.types";

import { WizardField, WizardFieldGrid } from "./demand-planning-wizard-field";
import { WizardBranchPicker, WizardDealerPicker } from "./wizard-scope-pickers";

export function WizardStepScope({
  periods,
  dealers,
  branches,
  periodId,
  name,
  dealerIds,
  branchIds,
  frequencyOverride,
  historyFrom,
  historyTo,
  branchCaption,
  onPeriodId,
  onName,
  onDealerIds,
  onBranchIds,
  onFrequencyOverride,
  onHistoryFrom,
  onHistoryTo,
}: {
  periods: DemandPlanningWizardPeriod[];
  dealers: DemandPlanningWizardDealer[];
  branches: DemandPlanningWizardBranch[];
  periodId: string;
  name: string;
  dealerIds: string[];
  branchIds: string[];
  frequencyOverride: number | null;
  historyFrom: string;
  historyTo: string;
  branchCaption?: string;
  onPeriodId: (value: string) => void;
  onName: (value: string) => void;
  onDealerIds: (value: string[]) => void;
  onBranchIds: (value: string[]) => void;
  onFrequencyOverride: (value: number | null) => void;
  onHistoryFrom: (value: string) => void;
  onHistoryTo: (value: string) => void;
}) {
  const dealerFilter = new Set(dealerIds);
  const scopedBranches =
    dealerIds.length === 0
      ? []
      : branches.filter((branch) => branch.dealerId && dealerFilter.has(branch.dealerId));

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
          options={periods.map((period) => {
            const label = displayPeriodLabel(period.label);
            return {
              id: period.id,
              label: period.isActive ? `${label} (active)` : label,
            };
          })}
          value={periodId}
          onChange={onPeriodId}
          placeholder={periods.length === 0 ? "No periods yet" : "Select period…"}
          searchPlaceholder="Search periods…"
          emptyMessage="Import an SFE forecast in Settings to create a period."
        />
      </WizardField>

      <div className="sm:col-span-2 xl:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WizardField
          label="Date from"
          htmlFor="history-from"
          hint="Sales history used for the average (excludes the planning month when left at default)"
        >
          <Input
            id="history-from"
            type="date"
            value={historyFrom}
            onChange={(event) => onHistoryFrom(event.target.value)}
          />
        </WizardField>

        <WizardField label="Date to" htmlFor="history-to">
          <Input
            id="history-to"
            type="date"
            value={historyTo}
            onChange={(event) => onHistoryTo(event.target.value)}
          />
        </WizardField>
      </div>

      <WizardField label="Dealers in scope" className="sm:col-span-2 xl:col-span-3">
        <WizardDealerPicker
          dealers={dealers}
          dealerIds={dealerIds}
          onDealerIds={onDealerIds}
          onFilterBranches={filterBranchesToDealers}
        />
      </WizardField>

      <WizardField
        label="Branches in scope"
        hint={branchCaption}
        className="sm:col-span-2 xl:col-span-3"
      >
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
