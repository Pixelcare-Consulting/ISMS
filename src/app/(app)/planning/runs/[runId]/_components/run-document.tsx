"use client";

import type { DemandPlanningPlanStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { DemandPlanningChromeBar } from "@/app/(app)/planning/_components/demand-planning-chrome-bar";
import { DemandPlanningMetricStrip } from "@/app/(app)/planning/_components/demand-planning-metric-strip";
import { DemandPlanningReleaseButton } from "@/app/(app)/planning/_components/demand-planning-release-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemandPlanningGrid } from "@/features/demand-planning";
import {
  exportDemandPlanRunAction,
  getDemandPlanningRunGridAction,
  recalculateDemandPlanRunAction,
  saveDemandPlanOverrideAction,
} from "@/features/demand-planning/actions/demand-planning.actions";
import { sumGridLineTotals } from "@/features/demand-planning/lib/client-mappers";
import {
  formatDemandDays,
  formatDemandPeso,
  formatDemandQty,
} from "@/features/demand-planning/lib/format-demand-plan";
import type {
  DemandPlanningClientRun,
  DemandPlanningGridLine,
} from "@/features/demand-planning/types/run.types";
import { downloadCsvFile } from "@/lib/shared/download-csv";

function branchPlanStatusCaption(status: DemandPlanningPlanStatus): string | null {
  switch (status) {
    case "planned":
      return null;
    case "no_history":
      return "No history";
    case "awaiting":
      return "Awaiting";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function DemandPlanningRunDocument({
  run,
  initialBranchId,
  initialLines,
  canManage,
  canRelease,
  actorName,
  onClose,
  onRunChanged,
}: {
  run: DemandPlanningClientRun;
  initialBranchId: string | null;
  initialLines: DemandPlanningGridLine[];
  canManage: boolean;
  canRelease: boolean;
  actorName?: string;
  onClose?: () => void;
  onRunChanged?: (runId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [showNil, setShowNil] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState(initialBranchId ?? run.branches[0]?.id ?? "");
  const [lines, setLines] = useState(initialLines);
  const readOnly = run.status === "released" || run.status === "superseded" || !canManage;

  const activeBranch = useMemo(
    () => run.branches.find((branch) => branch.id === activeBranchId) ?? run.branches[0] ?? null,
    [run.branches, activeBranchId],
  );
  const releaseBranchHints = useMemo(
    () =>
      run.branches.map((branch) => ({
        sapCode: branch.sapCode,
        name: branch.name,
        planStatus: branch.planStatus,
        drop1Qty: branch.totals.drop1Qty,
      })),
    [run.branches],
  );
  const totals = sumGridLineTotals(lines);

  async function loadBranch(runBranchId: string) {
    const result = await getDemandPlanningRunGridAction(run.id, runBranchId);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    if ("lines" in result && result.lines) {
      setActiveBranchId(result.branchId ?? runBranchId);
      setLines(result.lines);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DemandPlanningChromeBar
        crumbs={[
          { label: "Settings" },
          { label: "Demand Planning" },
          { label: `${run.documentNumber} · v${run.version}` },
        ]}
        status={run.status}
        actorName={actorName}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-4 px-5 py-5 sm:px-6">
        {run.originalDocumentNumber ? (
          <p className="text-xs text-muted-foreground">Original {run.originalDocumentNumber}</p>
        ) : null}
        <DemandPlanningMetricStrip
          columns={6}
          items={[
            {
              label: "Branch",
              value: activeBranch ? activeBranch.sapCode : "—",
              hint: activeBranch?.name,
            },
            {
              label: "Quota ₱",
              value: activeBranch ? formatDemandPeso(activeBranch.quotaPeso) : "—",
            },
            {
              label: "Min level",
              value: activeBranch ? formatDemandDays(activeBranch.minLevelDays) : "—",
              hint: activeBranch ? formatDemandPeso(activeBranch.minLevelPeso) : undefined,
            },
            {
              label: "Month allocation",
              value: `${formatDemandQty(totals.allocQty)} u`,
              hint: formatDemandPeso(totals.allocPeso),
            },
            {
              label: "Drop 1 suggested",
              value: `${formatDemandQty(totals.drop1Qty)} u`,
              hint: formatDemandPeso(totals.drop1Peso),
              emphasize: true,
            },
            {
              label: "Delivery freq",
              value: activeBranch ? `${activeBranch.dropsPerMonth}/mo` : "—",
            },
          ]}
        />

        {run.branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">This run has no branches.</p>
        ) : (
          <Tabs
            value={activeBranchId}
            onValueChange={(value) => {
              startTransition(async () => {
                await loadBranch(value);
              });
            }}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Branches
                </p>
                <TabsList variant="line" className="max-w-full flex-wrap">
                  {run.branches.map((branch) => {
                    const statusCaption = branchPlanStatusCaption(branch.planStatus);
                    return (
                      <TabsTrigger key={branch.id} value={branch.id} className="max-w-[16rem] shrink-0">
                        <span className="truncate font-medium">
                          {branch.sapCode} · {branch.name}
                        </span>
                        {statusCaption ? (
                          <span className="text-[11px] font-normal text-muted-foreground">
                            {statusCaption}
                          </span>
                        ) : null}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch
                  id="run-document-show-nil"
                  checked={showNil}
                  onCheckedChange={setShowNil}
                />
                <Label htmlFor="run-document-show-nil" className="text-sm text-muted-foreground">
                  Show nil lines
                </Label>
              </div>
            </div>
            {run.branches.map((branch) => (
              <TabsContent key={branch.id} value={branch.id} className="mt-4 space-y-3">
                {branch.id === activeBranchId ? (
                  <DemandPlanningGrid
                    variant="document"
                    lines={lines}
                    totals={totals}
                    readOnly={readOnly}
                    isSaving={saving || pending}
                    showNil={showNil}
                    onShowNilChange={setShowNil}
                    onSaveOverride={
                      readOnly
                        ? undefined
                        : async (input) => {
                            setSaving(true);
                            const result = await saveDemandPlanOverrideAction({
                              runId: run.id,
                              ...input,
                            });
                            setSaving(false);
                            if ("error" in result && result.error) {
                              toast.error(result.error);
                              return { error: result.error };
                            }
                            if ("lines" in result && result.lines) setLines(result.lines);
                            router.refresh();
                            return {};
                          }
                    }
                  />
                ) : null}
              </TabsContent>
            ))}
          </Tabs>
        )}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-start gap-2 border-t px-5 py-3 sm:px-6">
        {canRelease && run.status === "generated" ? (
          <DemandPlanningReleaseButton
            runId={run.id}
            documentNumber={run.documentNumber}
            disabled={pending}
            branches={releaseBranchHints}
            onReleased={() => {
              if (onClose) {
                onClose();
                return;
              }
              router.refresh();
            }}
          />
        ) : null}
        {canManage && run.status !== "superseded" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await recalculateDemandPlanRunAction(run.id);
                if ("error" in result && result.error) {
                  toast.error(result.error);
                  return;
                }
                if (!("runId" in result)) return;
                toast.success(result.runId === run.id ? "Plan recalculated" : "New version created", {
                  description: result.documentNumber,
                });
                if (result.runId !== run.id) {
                  onRunChanged?.(result.runId);
                  return;
                }
                router.refresh();
                await loadBranch(activeBranchId);
              });
            }}
          >
            Recalculate
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await exportDemandPlanRunAction(run.id);
              if ("error" in result && result.error) {
                toast.error(result.error);
                return;
              }
              if ("csv" in result && result.csv && result.filename) {
                downloadCsvFile(result.csv, result.filename);
              }
            });
          }}
        >
          Export
        </Button>
      </footer>
    </div>
  );
}
