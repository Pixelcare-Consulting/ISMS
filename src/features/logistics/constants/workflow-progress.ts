import type {
  ProgressNode,
  ProgressStageIcon,
  ProgressStepEvent,
  ProgressStepState,
} from "@/app/(app)/logistics/_components/progress-tracker";

import {
  workflowStatusLabel,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";

function normalize(code: string): string {
  return code.trim().toLowerCase();
}

function prefixCount(times: readonly (string | null)[]): number {
  let count = 0;
  for (const time of times) {
    if (!time) break;
    count += 1;
  }
  return count;
}

/**
 * Progress steps are the active workflow codes in Status settings order.
 * Stop codes (rejected, cancelled) are not future steps. A code that is not
 * in the active list still shows as the current step, using the name stored
 * on the document.
 */
export function buildCatalogProgress(input: {
  catalog: readonly WorkflowStatusOption[];
  status: { code: string; name: string; color: string | null };
  stopCodes: readonly string[];
  settledCodes: readonly string[];
  icons: Readonly<Record<string, ProgressStageIcon>>;
  occurredAt: (code: string) => string | null;
  eventsFor: (code: string) => readonly ProgressStepEvent[];
  stopAt: string | null;
  stopEvents: readonly ProgressStepEvent[];
}): ProgressNode[] {
  const stop = new Set(input.stopCodes.map(normalize));
  const settled = new Set(input.settledCodes.map(normalize));
  const steps = [...input.catalog]
    .filter((row) => !stop.has(normalize(row.code)))
    .sort(
      (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
    );

  const currentKey = normalize(input.status.code);
  const matchedIndex = steps.findIndex((step) => normalize(step.code) === currentKey);

  function nodesFor(
    rows: readonly WorkflowStatusOption[],
    stateAt: (index: number) => ProgressStepState,
  ): ProgressNode[] {
    return rows.map((step, index) => {
      const state = stateAt(index);
      return {
        key: step.code,
        label: workflowStatusLabel(step),
        state,
        at: state === "upcoming" ? null : input.occurredAt(step.code),
        color: step.color,
        badgeCode: step.code,
        icon: input.icons[normalize(step.code)],
        events: input.eventsFor(step.code),
      };
    });
  }

  if (stop.has(currentKey)) {
    const times = steps.map((step) => input.occurredAt(step.code));
    const proven = prefixCount(times);
    const nodes = nodesFor(steps, (index) => (index < proven ? "completed" : "upcoming"));
    nodes.splice(proven, 0, {
      key: input.status.code,
      label: workflowStatusLabel(input.status),
      state: "cancelled",
      at: input.stopAt,
      color: input.status.color,
      badgeCode: input.status.code,
      icon: "stopped",
      events: input.stopEvents,
    });
    return nodes;
  }

  if (matchedIndex < 0) {
    const current: ProgressNode = {
      key: input.status.code,
      label: workflowStatusLabel(input.status),
      state: "current",
      at: input.occurredAt(input.status.code),
      color: input.status.color,
      badgeCode: input.status.code,
      icon: input.icons[currentKey],
      events: input.eventsFor(input.status.code),
    };
    return [current, ...nodesFor(steps, () => "upcoming")];
  }

  const finishCurrent = settled.has(currentKey);
  return nodesFor(steps, (index) => {
    if (index < matchedIndex) return "completed";
    if (index > matchedIndex) return "upcoming";
    return finishCurrent ? "completed" : "current";
  });
}
