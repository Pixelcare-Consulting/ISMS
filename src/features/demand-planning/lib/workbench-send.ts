import { drop1QtyForRelease } from "@/features/demand-planning/lib/release-lines";

export type WorkbenchSendLine = {
  modelId: string;
  computedDrop1Qty: number;
};

/**
 * Phase 2 send: only the caller-selected SKUs, and never a 0-qty order line.
 * Unlike Release, this does not freeze a Demand Planning document.
 */
export function orderDetailsFromSelectedDrop1(
  lines: WorkbenchSendLine[],
  selectedModelIds: readonly string[],
): { details: Array<{ modelId: string; quantity: number }>; skippedZeroCount: number } {
  const selected = new Set(selectedModelIds);
  const details: Array<{ modelId: string; quantity: number }> = [];
  let skippedZeroCount = 0;

  for (const line of lines) {
    if (!selected.has(line.modelId)) continue;
    const quantity = drop1QtyForRelease(line.computedDrop1Qty);
    if (quantity <= 0) {
      skippedZeroCount += 1;
      continue;
    }
    details.push({ modelId: line.modelId, quantity });
  }

  return { details, skippedZeroCount };
}

export function workbenchOverrideDiffs(input: {
  facts: Array<{
    modelId: string;
    computedDisplayUnits: number;
    displayUnits: number;
    computedForecastQty: number;
    forecastQty: number;
  }>;
  overrides: Array<{ modelId: string; displayUnits: number; forecastQty: number }>;
}): Array<{ modelId: string; field: "displayUnits" | "forecastQty"; beforeValue: string; afterValue: string }> {
  const byModel = new Map(input.facts.map((fact) => [fact.modelId, fact]));
  const diffs: Array<{
    modelId: string;
    field: "displayUnits" | "forecastQty";
    beforeValue: string;
    afterValue: string;
  }> = [];

  for (const override of input.overrides) {
    const fact = byModel.get(override.modelId);
    if (!fact) continue;
    if (override.displayUnits !== fact.computedDisplayUnits) {
      diffs.push({
        modelId: override.modelId,
        field: "displayUnits",
        beforeValue: String(fact.computedDisplayUnits),
        afterValue: String(override.displayUnits),
      });
    }
    if (override.forecastQty !== fact.computedForecastQty) {
      diffs.push({
        modelId: override.modelId,
        field: "forecastQty",
        beforeValue: String(fact.computedForecastQty),
        afterValue: String(override.forecastQty),
      });
    }
  }

  return diffs;
}
