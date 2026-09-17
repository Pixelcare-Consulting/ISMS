"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDemandPeso,
  formatDemandQty,
  formatDemandShare,
} from "@/features/demand-planning/lib/format-demand-plan";
import { sumGridLineTotals } from "@/features/demand-planning/lib/client-mappers";
import { cn } from "@/utils/cn";

import type {
  DemandPlanningGridBandId,
  DemandPlanningGridProps,
} from "./demand-planning-grid.types";

const BANDS: Array<{ id: DemandPlanningGridBandId; label: string }> = [
  { id: "identity", label: "SKU" },
  { id: "history", label: "History" },
  { id: "mil", label: "MIL" },
  { id: "onHand", label: "On hand" },
  { id: "forecast", label: "Forecast" },
  { id: "allocation", label: "Allocation" },
  { id: "delivery", label: "Delivery" },
];

const DROP1_CELL = "bg-primary/5";
const DOCUMENT_NUMERIC = "px-1.5 py-1.5 text-right text-xs tabular-nums";
const DOCUMENT_HEAD = "px-1.5 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide";

function isNilRow(line: DemandPlanningGridProps["lines"][number]): boolean {
  return (
    line.historyQty === 0 &&
    line.displayUnits === 0 &&
    line.onHandQty === 0 &&
    line.forecastQty === 0 &&
    line.allocQty === 0 &&
    line.computedDrop1Qty === 0 &&
    (line.releasedDrop1Qty ?? 0) === 0
  );
}

function QtyInput({
  value,
  disabled,
  ariaLabel,
  onCommit,
  compact = false,
}: {
  value: number;
  disabled: boolean;
  ariaLabel: string;
  onCommit: (next: number) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <Input
      type="number"
      min={0}
      step={1}
      aria-label={ariaLabel}
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = Math.max(0, Math.trunc(Number(draft) || 0));
        setDraft(String(next));
        if (next !== value) onCommit(next);
      }}
      className={cn("h-8 px-1.5 text-right tabular-nums", compact ? "w-14 text-xs" : "w-16")}
    />
  );
}

function DocumentPlanningTable({
  lines,
  totals,
  readOnly,
  isSaving,
  onSaveOverride,
  showNil,
}: {
  lines: DemandPlanningGridProps["lines"];
  totals: DemandPlanningGridProps["totals"];
  readOnly: boolean;
  isSaving: boolean;
  onSaveOverride?: DemandPlanningGridProps["onSaveOverride"];
  showNil: boolean;
}) {
  const visible = useMemo(
    () => (showNil ? lines : lines.filter((line) => !isNilRow(line))),
    [lines, showNil],
  );
  const footer = totals ?? sumGridLineTotals(lines);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table scrollContainer={false} className="min-w-[880px] text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead colSpan={4} className="px-1.5 py-1.5 text-center text-[11px]">
              ITEM
            </TableHead>
            <TableHead colSpan={2} className="px-1.5 py-1.5 text-center text-[11px]">
              MIL
            </TableHead>
            <TableHead colSpan={2} className="px-1.5 py-1.5 text-center text-[11px]">
              ON HAND
            </TableHead>
            <TableHead colSpan={2} className="px-1.5 py-1.5 text-center text-[11px]">
              SFE FORECAST
            </TableHead>
            <TableHead colSpan={2} className="px-1.5 py-1.5 text-center text-[11px]">
              MONTH ALLOCATION
            </TableHead>
            <TableHead colSpan={3} className="px-1.5 py-1.5 text-center text-[11px]">
              SUGGESTED DELIVERY
            </TableHead>
          </TableRow>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-10 bg-card px-1.5 py-1.5 text-[11px]">Model</TableHead>
            <TableHead className="px-1.5 py-1.5 text-[11px]">Series</TableHead>
            <TableHead className={`${DOCUMENT_HEAD}`}>SRP</TableHead>
            <TableHead className={`${DOCUMENT_HEAD}`}>Adj mix</TableHead>
            <TableHead className={DOCUMENT_HEAD}>MIL qty</TableHead>
            <TableHead className={DOCUMENT_HEAD}>MIL ₱</TableHead>
            <TableHead className={DOCUMENT_HEAD}>DU</TableHead>
            <TableHead className={DOCUMENT_HEAD}>On hand</TableHead>
            <TableHead className={DOCUMENT_HEAD}>FC qty</TableHead>
            <TableHead className={DOCUMENT_HEAD}>FC ₱</TableHead>
            <TableHead className={DOCUMENT_HEAD}>Alloc qty</TableHead>
            <TableHead className={DOCUMENT_HEAD}>Alloc ₱</TableHead>
            <TableHead className={cn(DOCUMENT_HEAD, DROP1_CELL)}>Drop 1</TableHead>
            <TableHead className={DOCUMENT_HEAD}>Cycle qty</TableHead>
            <TableHead className={DOCUMENT_HEAD}>Drop 1 ₱</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={15} className="py-10 text-center text-muted-foreground">
                No SKUs to show for this branch.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((line) => {
              const drop1 = line.releasedDrop1Qty ?? line.computedDrop1Qty;
              return (
                <TableRow key={line.id}>
                  <TableCell className="sticky left-0 z-10 bg-card px-1.5 py-1.5 font-medium">
                    {line.skuCode}
                  </TableCell>
                  <TableCell className="px-1.5 py-1.5">{line.seriesCode}</TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(line.srp)}</TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{formatDemandShare(line.adjHmix)}</TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{line.milQty}</TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(line.milPeso)}</TableCell>
                  <TableCell className="px-1.5 py-1.5">
                    {readOnly || !onSaveOverride ? (
                      <span className="block text-right text-xs tabular-nums">{line.displayUnits}</span>
                    ) : (
                      <QtyInput
                        compact
                        key={`${line.id}-du-${line.displayUnits}`}
                        value={line.displayUnits}
                        disabled={isSaving}
                        ariaLabel={`Display units ${line.skuCode}`}
                        onCommit={(value) => {
                          void onSaveOverride({
                            lineId: line.id,
                            field: "displayUnits",
                            value,
                          });
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{line.onHandQty}</TableCell>
                  <TableCell className="px-1.5 py-1.5">
                    {readOnly || !onSaveOverride ? (
                      <span className="block text-right text-xs tabular-nums">{line.forecastQty}</span>
                    ) : (
                      <QtyInput
                        compact
                        key={`${line.id}-fc-${line.forecastQty}`}
                        value={line.forecastQty}
                        disabled={isSaving}
                        ariaLabel={`Forecast ${line.skuCode}`}
                        onCommit={(value) => {
                          void onSaveOverride({
                            lineId: line.id,
                            field: "forecastQty",
                            value,
                          });
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(line.forecastPeso)}</TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{line.allocQty}</TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(line.allocPeso)}</TableCell>
                  <TableCell className={cn(DOCUMENT_NUMERIC, DROP1_CELL, "font-medium")}>{drop1}</TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{line.cycleQty}</TableCell>
                  <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(line.drop1Peso)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="sticky left-0 z-10 bg-muted px-1.5 py-1.5 font-medium">Totals</TableCell>
            <TableCell className="px-1.5 py-1.5" />
            <TableCell className="px-1.5 py-1.5" />
            <TableCell className="px-1.5 py-1.5" />
            <TableCell className={DOCUMENT_NUMERIC}>{footer.milQty}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(footer.milPeso)}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{footer.displayUnits}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{footer.onHandQty}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{footer.forecastQty}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(footer.forecastPeso)}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{footer.allocQty}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(footer.allocPeso)}</TableCell>
            <TableCell className={cn(DOCUMENT_NUMERIC, DROP1_CELL)}>{footer.drop1Qty}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{footer.cycleQty}</TableCell>
            <TableCell className={DOCUMENT_NUMERIC}>{formatDemandPeso(footer.drop1Peso)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

export function DemandPlanningGrid({
  lines,
  totals,
  readOnly = false,
  isSaving = false,
  onSaveOverride,
  selectable = false,
  selectedLineIds,
  onSelectedLineIdsChange,
  variant = "workbench",
  showNil: showNilProp,
  onShowNilChange,
}: DemandPlanningGridProps) {
  const [internalShowNil, setInternalShowNil] = useState(false);
  const showNil = showNilProp ?? internalShowNil;
  const [openBands, setOpenBands] = useState<Record<DemandPlanningGridBandId, boolean>>({
    identity: true,
    history: true,
    mil: true,
    onHand: true,
    forecast: true,
    allocation: true,
    delivery: true,
  });

  function setShowNil(value: boolean) {
    onShowNilChange?.(value);
    if (showNilProp === undefined) setInternalShowNil(value);
  }

  const visible = useMemo(
    () => (showNil ? lines : lines.filter((line) => !isNilRow(line))),
    [lines, showNil],
  );
  const footer = totals ?? sumGridLineTotals(lines);
  const selected = useMemo(() => new Set(selectedLineIds ?? []), [selectedLineIds]);
  const visibleSelectedCount = visible.filter((line) => selected.has(line.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length;

  function toggleAllVisible(checked: boolean) {
    if (!onSelectedLineIdsChange) return;
    const next = new Set(selected);
    for (const line of visible) {
      if (checked) next.add(line.id);
      else next.delete(line.id);
    }
    onSelectedLineIdsChange([...next]);
  }

  function toggleLine(lineId: string, checked: boolean) {
    if (!onSelectedLineIdsChange) return;
    const next = new Set(selected);
    if (checked) next.add(lineId);
    else next.delete(lineId);
    onSelectedLineIdsChange([...next]);
  }

  const emptyColSpan = 20 + (selectable ? 1 : 0);

  function toggleBand(id: DemandPlanningGridBandId) {
    if (id === "identity") return;
    setOpenBands((current) => ({ ...current, [id]: !current[id] }));
  }

  function open(id: DemandPlanningGridBandId) {
    return openBands[id];
  }

  if (variant === "document") {
    return (
      <DocumentPlanningTable
        lines={lines}
        totals={totals}
        readOnly={readOnly}
        isSaving={isSaving}
        onSaveOverride={onSaveOverride}
        showNil={showNil}
      />
    );
  }

  if (variant !== "workbench") {
    const _exhaustive: never = variant;
    throw new Error(`Unhandled grid variant: ${_exhaustive}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {BANDS.map((band) => (
            <Button
              key={band.id}
              type="button"
              size="sm"
              variant={open(band.id) ? "secondary" : "outline"}
              onClick={() => toggleBand(band.id)}
              disabled={band.id === "identity"}
            >
              {band.label}
              {band.id !== "identity" ? (
                <ChevronDown
                  className={cn("size-3.5 transition-transform", open(band.id) ? "" : "-rotate-90")}
                />
              ) : null}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-nil" checked={showNil} onCheckedChange={setShowNil} />
          <Label htmlFor="show-nil" className="text-sm text-muted-foreground">
            Show nil rows
          </Label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table scrollContainer={false} className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              {selectable ? (
                <TableHead className="w-10 px-2">
                  <Checkbox
                    aria-label="Select all visible SKUs"
                    checked={
                      allVisibleSelected
                        ? true
                        : visibleSelectedCount > 0
                          ? "indeterminate"
                          : false
                    }
                    disabled={!onSelectedLineIdsChange || visible.length === 0}
                    onCheckedChange={(value) => toggleAllVisible(value === true)}
                  />
                </TableHead>
              ) : null}
              <TableHead className="sticky left-0 z-10 bg-card px-2">SKU</TableHead>
              <TableHead className="px-2">Series</TableHead>
              <TableHead className="px-2 text-right">SRP</TableHead>
              <TableHead className="px-2">PM</TableHead>
              {open("history") ? (
                <>
                  <TableHead className="px-2 text-right">Hist qty</TableHead>
                  <TableHead className="px-2 text-right">Hist ₱</TableHead>
                  <TableHead className="px-2 text-right">HMIX</TableHead>
                  <TableHead className="px-2 text-right">Adj</TableHead>
                </>
              ) : null}
              {open("mil") ? (
                <>
                  <TableHead className="px-2 text-right">MIL qty</TableHead>
                  <TableHead className="px-2 text-right">MIL ₱</TableHead>
                </>
              ) : null}
              {open("onHand") ? (
                <>
                  <TableHead className="px-2 text-right">DU</TableHead>
                  <TableHead className="px-2 text-right">On hand</TableHead>
                </>
              ) : null}
              {open("forecast") ? (
                <>
                  <TableHead className="px-2 text-right">FC</TableHead>
                  <TableHead className="px-2 text-right">FC ₱</TableHead>
                </>
              ) : null}
              {open("allocation") ? (
                <>
                  <TableHead className="px-2 text-right">Alloc qty</TableHead>
                  <TableHead className="px-2 text-right">Alloc ₱</TableHead>
                  <TableHead className="px-2 text-right">Cycle</TableHead>
                </>
              ) : null}
              {open("delivery") ? (
                <>
                  <TableHead className="px-2 text-right">Drop 1</TableHead>
                  <TableHead className="px-2 text-right">Drop 1 ₱</TableHead>
                  <TableHead className="px-2 text-right">Total inv ₱</TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={emptyColSpan} className="py-10 text-center text-muted-foreground">
                  No SKUs to show for this branch.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((line) => {
                const drop1 = line.releasedDrop1Qty ?? line.computedDrop1Qty;
                return (
                  <TableRow key={line.id}>
                    {selectable ? (
                      <TableCell className="px-2">
                        <Checkbox
                          aria-label={`Select ${line.skuCode}`}
                          checked={selected.has(line.id)}
                          disabled={!onSelectedLineIdsChange}
                          onCheckedChange={(value) => toggleLine(line.id, value === true)}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="sticky left-0 z-10 bg-card px-2 font-medium">
                      {line.skuCode}
                    </TableCell>
                    <TableCell className="px-2">{line.seriesCode}</TableCell>
                    <TableCell className="px-2 text-right tabular-nums">
                      {formatDemandPeso(line.srp)}
                    </TableCell>
                    <TableCell className="px-2 uppercase">{line.planogramFlag === "blank" ? "—" : line.planogramFlag}</TableCell>
                    {open("history") ? (
                      <>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandQty(line.historyQty)}
                        </TableCell>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandPeso(line.historyPeso)}
                        </TableCell>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandShare(line.hmix)}
                        </TableCell>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandShare(line.adjHmix)}
                        </TableCell>
                      </>
                    ) : null}
                    {open("mil") ? (
                      <>
                        <TableCell className="px-2 text-right tabular-nums">{line.milQty}</TableCell>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandPeso(line.milPeso)}
                        </TableCell>
                      </>
                    ) : null}
                    {open("onHand") ? (
                      <>
                        <TableCell className="px-2">
                          {readOnly || !onSaveOverride ? (
                            <span className="block text-right tabular-nums">{line.displayUnits}</span>
                          ) : (
                            <QtyInput
                              key={`${line.id}-du-${line.displayUnits}`}
                              value={line.displayUnits}
                              disabled={isSaving}
                              ariaLabel={`Display units ${line.skuCode}`}
                              onCommit={(value) => {
                                void onSaveOverride({
                                  lineId: line.id,
                                  field: "displayUnits",
                                  value,
                                });
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell className="px-2 text-right tabular-nums">{line.onHandQty}</TableCell>
                      </>
                    ) : null}
                    {open("forecast") ? (
                      <>
                        <TableCell className="px-2">
                          {readOnly || !onSaveOverride ? (
                            <span className="block text-right tabular-nums">{line.forecastQty}</span>
                          ) : (
                            <QtyInput
                              key={`${line.id}-fc-${line.forecastQty}`}
                              value={line.forecastQty}
                              disabled={isSaving}
                              ariaLabel={`Forecast ${line.skuCode}`}
                              onCommit={(value) => {
                                void onSaveOverride({
                                  lineId: line.id,
                                  field: "forecastQty",
                                  value,
                                });
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandPeso(line.forecastPeso)}
                        </TableCell>
                      </>
                    ) : null}
                    {open("allocation") ? (
                      <>
                        <TableCell className="px-2 text-right tabular-nums">{line.allocQty}</TableCell>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandPeso(line.allocPeso)}
                        </TableCell>
                        <TableCell className="px-2 text-right tabular-nums">{line.cycleQty}</TableCell>
                      </>
                    ) : null}
                    {open("delivery") ? (
                      <>
                        <TableCell className="px-2 text-right tabular-nums font-medium">{drop1}</TableCell>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandPeso(line.drop1Peso)}
                        </TableCell>
                        <TableCell className="px-2 text-right tabular-nums">
                          {formatDemandPeso(line.totalInventoryPeso)}
                        </TableCell>
                      </>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              {selectable ? <TableCell className="px-2" /> : null}
              <TableCell className="sticky left-0 z-10 bg-muted px-2 font-medium">Totals</TableCell>
              <TableCell className="px-2" />
              <TableCell className="px-2" />
              <TableCell className="px-2 text-muted-foreground">{footer.planogramSkuCount} Y</TableCell>
              {open("history") ? (
                <>
                  <TableCell className="px-2 text-right tabular-nums">
                    {formatDemandQty(footer.historyQty)}
                  </TableCell>
                  <TableCell className="px-2 text-right tabular-nums">
                    {formatDemandPeso(footer.historyPeso)}
                  </TableCell>
                  <TableCell className="px-2" />
                  <TableCell className="px-2" />
                </>
              ) : null}
              {open("mil") ? (
                <>
                  <TableCell className="px-2 text-right tabular-nums">{footer.milQty}</TableCell>
                  <TableCell className="px-2 text-right tabular-nums">
                    {formatDemandPeso(footer.milPeso)}
                  </TableCell>
                </>
              ) : null}
              {open("onHand") ? (
                <>
                  <TableCell className="px-2 text-right tabular-nums">{footer.displayUnits}</TableCell>
                  <TableCell className="px-2 text-right tabular-nums">{footer.onHandQty}</TableCell>
                </>
              ) : null}
              {open("forecast") ? (
                <>
                  <TableCell className="px-2 text-right tabular-nums">{footer.forecastQty}</TableCell>
                  <TableCell className="px-2 text-right tabular-nums">
                    {formatDemandPeso(footer.forecastPeso)}
                  </TableCell>
                </>
              ) : null}
              {open("allocation") ? (
                <>
                  <TableCell className="px-2 text-right tabular-nums">{footer.allocQty}</TableCell>
                  <TableCell className="px-2 text-right tabular-nums">
                    {formatDemandPeso(footer.allocPeso)}
                  </TableCell>
                  <TableCell className="px-2 text-right tabular-nums">{footer.cycleQty}</TableCell>
                </>
              ) : null}
              {open("delivery") ? (
                <>
                  <TableCell className="px-2 text-right tabular-nums">{footer.drop1Qty}</TableCell>
                  <TableCell className="px-2 text-right tabular-nums">
                    {formatDemandPeso(footer.drop1Peso)}
                  </TableCell>
                  <TableCell className="px-2 text-right tabular-nums">
                    {formatDemandPeso(footer.totalInventoryPeso)}
                  </TableCell>
                </>
              ) : null}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
