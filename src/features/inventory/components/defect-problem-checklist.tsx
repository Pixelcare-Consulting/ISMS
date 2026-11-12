"use client";

import { useEffect, useId, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { listActiveProblemDescriptionsAction } from "@/features/inventory/actions/defect.actions";
import { cn } from "@/utils/cn";

/** Matches the defect report reason length. Chosen names are stored in that field. */
const DEFECT_PROBLEM_TEXT_MAX = 500;

type ProblemOption = { id: string; name: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ProblemOption[] };

const EMPTY_CHECKLIST_MESSAGE =
  "No active problem descriptions. This report cannot be sent.";

function selectedProblemText(items: readonly ProblemOption[], selectedIds: readonly string[]): string {
  const selected = new Set(selectedIds);
  return items
    .filter((item) => selected.has(item.id))
    .map((item) => item.name.trim())
    .filter((name) => name.length > 0)
    .join("; ");
}

export function DefectProblemChecklist({
  disabled,
  onReasonChange,
}: {
  disabled: boolean;
  onReasonChange: (reason: string) => void;
}) {
  const labelId = useId();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listActiveProblemDescriptionsAction()
      .then((result) => {
        if (cancelled) return;
        if (!result || "error" in result) {
          setLoad({
            status: "error",
            message:
              result && "error" in result
                ? result.error
                : "Problem descriptions could not be loaded. This report cannot be sent.",
          });
          onReasonChange("");
          return;
        }
        setLoad({ status: "ready", items: result.items });
        onReasonChange("");
      })
      .catch(() => {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: "Problem descriptions could not be loaded. This report cannot be sent.",
        });
        onReasonChange("");
      });
    return () => {
      cancelled = true;
    };
  }, [onReasonChange]);

  const problemText = load.status === "ready" ? selectedProblemText(load.items, selectedIds) : "";
  const tooLong = problemText.length > DEFECT_PROBLEM_TEXT_MAX;

  function setChecked(id: string, checked: boolean) {
    if (load.status !== "ready" || disabled) return;
    const without = selectedIds.filter((itemId) => itemId !== id);
    const next = checked ? [...without, id] : without;
    setSelectedIds(next);
    const text = selectedProblemText(load.items, next);
    onReasonChange(text.length > DEFECT_PROBLEM_TEXT_MAX ? "" : text);
  }

  return (
    <div className="space-y-2">
      <p id={labelId} className="text-sm font-medium leading-none">
        Problem description
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-busy={load.status === "loading"}
        className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 px-2 py-2"
      >
        {load.status === "loading" ? (
          <>
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <p className="sr-only" role="status">
              Loading problem descriptions
            </p>
          </>
        ) : null}
        {load.status === "error" ? (
          <p className="px-1 py-1 text-sm text-destructive" role="alert">
            {load.message}
          </p>
        ) : null}
        {load.status === "ready" && load.items.length === 0 ? (
          <p className="px-1 py-1 text-sm text-muted-foreground" role="status">
            {EMPTY_CHECKLIST_MESSAGE}
          </p>
        ) : null}
        {load.status === "ready"
          ? load.items.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60",
                    checked && "bg-muted/40",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(value) => setChecked(item.id, value === true)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 break-words">{item.name}</span>
                </label>
              );
            })
          : null}
      </div>
      {load.status === "ready" && load.items.length > 0 && selectedIds.length === 0 ? (
        <p className="text-xs text-muted-foreground">Select at least one.</p>
      ) : null}
      {tooLong ? (
        <p className="text-sm text-destructive" role="alert">
          The selected problems are too long to save. Uncheck one.
        </p>
      ) : null}
    </div>
  );
}
