"use client";

import type { PulloutChecklistOptions } from "@/features/logistics/actions/logistics.actions";
import { PULLOUT_LINE_REMARKS_MAX } from "@/features/logistics/services/pullout-posting.planner";
import type { PulloutCreateLine } from "@/features/logistics/services/pullout-posting.service";
import { Input } from "@/components/ui/input";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";

/** Raises the option lists above the create dialog. */
const POPOVER_CLASS = "z-[100]";
const EMPTY_LOOKUP_MESSAGE = "None in Master data";
const MISSING_SERIALS_SHOWN = 3;

export const EMPTY_CHECKLIST_OPTIONS: PulloutChecklistOptions = {
  reasons: [],
  problemDescriptions: [],
  classifications: [],
  unitPackingConditions: [],
  accessoryCompleteness: [],
};

export const PULLOUT_LINE_FIELDS = [
  { field: "reason", header: "Reason" },
  { field: "classification", header: "Classification" },
  { field: "packing", header: "Unit packing condition" },
  { field: "accessories", header: "Acc completeness" },
  { field: "remarks", header: "Remarks" },
] as const;

type PulloutLineFieldName = (typeof PULLOUT_LINE_FIELDS)[number]["field"];
type UnitCode = "STK" | "DEF";

export interface PulloutLineChoice {
  pulloutReasonCodeId: string;
  problemDescriptionIds: string[];
  pulloutClassificationIds: string[];
  unitPackingConditionIds: string[];
  accessoryCompletenessIds: string[];
  remarks: string;
}

const EMPTY_CHOICE: PulloutLineChoice = {
  pulloutReasonCodeId: "",
  problemDescriptionIds: [],
  pulloutClassificationIds: [],
  unitPackingConditionIds: [],
  accessoryCompletenessIds: [],
  remarks: "",
};

export function pulloutLineChoice(
  choices: Readonly<Record<string, PulloutLineChoice>>,
  serialNumberId: string,
): PulloutLineChoice {
  return choices[serialNumberId] ?? EMPTY_CHOICE;
}

export function pulloutLineComplete(unitCode: UnitCode, choice: PulloutLineChoice): boolean {
  // A stock unit picks a reason. A defective unit's reason is fixed, so it names the problem.
  const typeDetailsDone =
    unitCode === "STK"
      ? choice.pulloutReasonCodeId !== "" && choice.pulloutClassificationIds.length > 0
      : choice.problemDescriptionIds.length > 0;
  return (
    typeDetailsDone &&
    choice.unitPackingConditionIds.length > 0 &&
    choice.accessoryCompletenessIds.length > 0
  );
}

/** Sends only what applies to the unit's type, so a stale pick cannot reach the server. */
export function pulloutLineInput(
  serialNumberId: string,
  unitCode: UnitCode,
  choice: PulloutLineChoice,
): PulloutCreateLine {
  const stock = unitCode === "STK";
  return {
    serialNumberId,
    pulloutReasonCodeId: stock ? choice.pulloutReasonCodeId : undefined,
    problemDescriptionIds: stock ? [] : choice.problemDescriptionIds,
    pulloutClassificationIds: stock ? choice.pulloutClassificationIds : [],
    unitPackingConditionIds: choice.unitPackingConditionIds,
    accessoryCompletenessIds: choice.accessoryCompletenessIds,
    remarks: choice.remarks,
  };
}

export function pulloutMissingDetailsText(missing: readonly { serialNo: string }[]): string {
  const named = missing.slice(0, MISSING_SERIALS_SHOWN).map((serial) => serial.serialNo);
  const others = missing.length - named.length;
  const serials = `${named.join(", ")}${others > 0 ? ` and ${others} more` : ""}`;
  return `Choose unit packing condition and acc completeness for every selected unit, plus reason and classification for STK units and a problem description for DEF units. Still missing: ${serials}.`;
}

function ChecklistField({
  label,
  options,
  selectedIds,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  return (
    <SearchableMultiSelect
      ariaLabel={label}
      options={options.map((option) => ({ id: option.id, label: option.name }))}
      selectedIds={selectedIds}
      onChange={onChange}
      disabled={disabled}
      emptyMessage={EMPTY_LOOKUP_MESSAGE}
      truncateLabels={false}
      popoverClassName={POPOVER_CLASS}
    />
  );
}

/** One detail of one unit. The create form and Add serials render the same fields. */
export function PulloutLineField({
  field,
  serialNumberId,
  serialNo,
  unitCode,
  options,
  choice,
  disabled,
  onChange,
}: {
  field: PulloutLineFieldName;
  serialNumberId: string;
  serialNo: string;
  unitCode: UnitCode;
  options: PulloutChecklistOptions;
  choice: PulloutLineChoice;
  disabled: boolean;
  onChange: (patch: Partial<PulloutLineChoice>) => void;
}) {
  switch (field) {
    case "reason":
      if (unitCode === "DEF") {
        return (
          <ChecklistField
            label={`Problem description for ${serialNo}`}
            options={options.problemDescriptions}
            selectedIds={choice.problemDescriptionIds}
            disabled={disabled}
            onChange={(problemDescriptionIds) => onChange({ problemDescriptionIds })}
          />
        );
      }
      return (
        <SearchableSelect
          id={`pullout-reason-${serialNumberId}`}
          ariaLabel={`Reason for ${serialNo}`}
          options={options.reasons.map((reason) => ({ id: reason.id, label: reason.name }))}
          value={choice.pulloutReasonCodeId}
          onChange={(pulloutReasonCodeId) => onChange({ pulloutReasonCodeId })}
          placeholder="Select…"
          searchPlaceholder="Search reasons…"
          emptyMessage={EMPTY_LOOKUP_MESSAGE}
          disabled={disabled}
          popoverClassName={POPOVER_CLASS}
        />
      );
    case "classification":
      if (unitCode === "DEF") return <span className="text-muted-foreground">—</span>;
      return (
        <ChecklistField
          label={`Classification for ${serialNo}`}
          options={options.classifications}
          selectedIds={choice.pulloutClassificationIds}
          disabled={disabled}
          onChange={(pulloutClassificationIds) => onChange({ pulloutClassificationIds })}
        />
      );
    case "packing":
      return (
        <ChecklistField
          label={`Unit packing condition for ${serialNo}`}
          options={options.unitPackingConditions}
          selectedIds={choice.unitPackingConditionIds}
          disabled={disabled}
          onChange={(unitPackingConditionIds) => onChange({ unitPackingConditionIds })}
        />
      );
    case "accessories":
      return (
        <ChecklistField
          label={`Acc completeness for ${serialNo}`}
          options={options.accessoryCompleteness}
          selectedIds={choice.accessoryCompletenessIds}
          disabled={disabled}
          onChange={(accessoryCompletenessIds) => onChange({ accessoryCompletenessIds })}
        />
      );
    case "remarks":
      return (
        <Input
          value={choice.remarks}
          maxLength={PULLOUT_LINE_REMARKS_MAX}
          disabled={disabled}
          aria-label={`Remarks for ${serialNo}`}
          onChange={(event) => onChange({ remarks: event.target.value })}
        />
      );
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}
