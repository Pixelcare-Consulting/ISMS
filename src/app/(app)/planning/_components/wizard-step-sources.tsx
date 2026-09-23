"use client";

import { Badge } from "@/components/ui/badge";
import { formatDemandPeso, formatDemandQty } from "@/features/demand-planning/lib/format-demand-plan";
import type { DemandPlanningSourcePreview } from "@/features/demand-planning/types/run.types";
import { cn } from "@/utils/cn";

type SourcePillTone = "isms" | "import" | "price";

function SourcePill({ label, tone }: { label: string; tone: SourcePillTone }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit shrink-0 font-normal tracking-wide",
        tone === "isms" && "border-teal-600/80 text-teal-800 dark:border-teal-400/70 dark:text-teal-300",
        tone === "import" && "border-muted-foreground/30 text-muted-foreground",
        tone === "price" && "border-amber-500/80 text-amber-800 dark:border-amber-400/70 dark:text-amber-300",
      )}
    >
      {label}
    </Badge>
  );
}

function SourceRow({
  label,
  rule,
  pill,
  tone,
  counts,
}: {
  label: string;
  rule: string;
  pill: string;
  tone: SourcePillTone;
  counts: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2.5 last:border-b-0">
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground"> · {rule}</span>
      </p>
      <SourcePill label={pill} tone={tone} />
      <p className="w-full text-sm tabular-nums text-muted-foreground sm:w-auto sm:text-right">
        {counts}
      </p>
    </div>
  );
}

export function WizardStepSources({
  preview,
  loading,
}: {
  preview: DemandPlanningSourcePreview | null;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Checking history, planogram, forecast, and on-hand…</p>;
  }

  const historyCounts = preview
    ? `${preview.historySkuCount} SKUs · ${formatDemandPeso(preview.historyPeso)}`
    : "—";
  const planogramTotal = preview?.planogramSkuCount;
  const planogramCounts = preview
    ? planogramTotal != null && planogramTotal > 0
      ? `${preview.planogramYCount} of ${planogramTotal} flagged Y`
      : `${preview.planogramYCount} flagged Y`
    : "—";
  const forecastCounts = preview
    ? `${formatDemandQty(preview.forecastUnitCount)} u · ${formatDemandPeso(preview.forecastPeso)}`
    : "—";
  const onHandCounts = preview
    ? `${formatDemandQty(preview.onHandUnitCount)} u · ${formatDemandPeso(preview.onHandPeso)}`
    : "—";
  const displayCounts =
    preview && preview.displayUnitsCount > 0
      ? `${formatDemandQty(preview.displayUnitsCount)} u · editable on the document`
      : "Editable on the document";

  return (
    <div>
      <SourceRow
        label="Sales history"
        rule="Rolling three-month average, excludes the current month"
        pill="ISMS"
        tone="isms"
        counts={historyCounts}
      />
      <SourceRow
        label="Planogram"
        rule="Allowed models for each branch"
        pill="IMPORT · PM"
        tone="import"
        counts={planogramCounts}
      />
      <SourceRow
        label="Forecast / quota"
        rule="SFE import for this sales period"
        pill="IMPORT · SFE"
        tone="import"
        counts={forecastCounts}
      />
      <SourceRow
        label="Ending inventory"
        rule="Stock units on hand (STK)"
        pill="ISMS"
        tone="isms"
        counts={onHandCounts}
      />
      <SourceRow
        label="Display units"
        rule="Facing count used on the document"
        pill="ISMS"
        tone="isms"
        counts={displayCounts}
      />
      <SourceRow
        label="Item master & SRP"
        rule="Current model price list"
        pill="Price list"
        tone="price"
        counts={preview ? "Ready" : "—"}
      />
    </div>
  );
}
