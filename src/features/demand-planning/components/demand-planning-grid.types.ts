import type {
  DemandPlanningGridLine,
  DemandPlanningGridTotals,
} from "@/features/demand-planning/types/run.types";

export type { DemandPlanningGridLine, DemandPlanningGridTotals };

export type DemandPlanningGridBandId =
  | "identity"
  | "history"
  | "mil"
  | "onHand"
  | "forecast"
  | "allocation"
  | "delivery";

export type DemandPlanningGridSaveOverride = (input: {
  lineId: string;
  field: "displayUnits" | "forecastQty";
  value: number;
}) => Promise<{ error?: string }>;

export interface DemandPlanningGridProps {
  lines: DemandPlanningGridLine[];
  totals: DemandPlanningGridTotals;
  readOnly?: boolean;
  isSaving?: boolean;
  onSaveOverride?: DemandPlanningGridSaveOverride;
  /** Optional row selection for the replenishment workbench send. */
  selectable?: boolean;
  selectedLineIds?: readonly string[];
  onSelectedLineIdsChange?: (ids: string[]) => void;
  /** Document = FIG A2 grouped headers. Workbench keeps collapsible history bands. */
  variant?: "document" | "workbench";
  showNil?: boolean;
  onShowNilChange?: (value: boolean) => void;
}
