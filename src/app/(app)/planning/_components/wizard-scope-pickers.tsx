"use client";

import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import type {
  DemandPlanningWizardBranch,
  DemandPlanningWizardDealer,
} from "@/features/demand-planning/types/run.types";

const WIZARD_POPOVER_CLASS = "z-[70]";

function dealerOptionLabel(dealer: DemandPlanningWizardDealer): string {
  return dealer.sapCode ? `${dealer.name} (${dealer.sapCode})` : dealer.name;
}

function branchOptionLabel(branch: DemandPlanningWizardBranch): string {
  return `${branch.name} (${branch.sapCode})`;
}

export function WizardDealerPicker({
  dealers,
  dealerIds,
  onDealerIds,
  onFilterBranches,
}: {
  dealers: DemandPlanningWizardDealer[];
  dealerIds: string[];
  onDealerIds: (value: string[]) => void;
  onFilterBranches: (nextDealerIds: string[]) => void;
}) {
  function commit(next: string[]) {
    onDealerIds(next);
    onFilterBranches(next);
  }

  return (
    <SearchableMultiSelect
      options={dealers.map((dealer) => ({
        id: dealer.id,
        label: dealerOptionLabel(dealer),
      }))}
      selectedIds={dealerIds}
      onChange={commit}
      placeholder="Select dealers…"
      searchPlaceholder="Filter dealers…"
      emptyMessage="No dealers"
      ariaLabel="Dealers in scope"
      showSelectedBadges={false}
      truncateLabels={false}
      popoverClassName={WIZARD_POPOVER_CLASS}
    />
  );
}

export function WizardBranchPicker({
  branches,
  branchIds,
  onBranchIds,
}: {
  branches: DemandPlanningWizardBranch[];
  branchIds: string[];
  onBranchIds: (value: string[]) => void;
}) {
  return (
    <SearchableMultiSelect
      options={branches.map((branch) => ({
        id: branch.id,
        label: branchOptionLabel(branch),
      }))}
      selectedIds={branchIds}
      onChange={onBranchIds}
      placeholder="Select branches…"
      searchPlaceholder="Filter branches…"
      emptyMessage="No branches"
      ariaLabel="Branches in scope"
      showSelectedBadges={false}
      truncateLabels={false}
      popoverClassName={WIZARD_POPOVER_CLASS}
    />
  );
}
