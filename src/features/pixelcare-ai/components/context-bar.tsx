"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PixelcareAiContext } from "@/features/pixelcare-ai/schemas/context.schema";
import { cn } from "@/utils/cn";

type BranchOption = { id: string; name: string; sapCode: string };

/**
 * Context Branch = active branch scope for subsequent Pixelcare AI tool calls
 * (stock / shelf gaps). It updates when a tool returns a specific permitted
 * branch (e.g. order status), not from free-text guesses.
 */
export function ContextBar(props: {
  context: PixelcareAiContext | null;
  onChange: (context: PixelcareAiContext | null) => void;
  className?: string;
}) {
  const [branches, setBranches] = useState<BranchOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/internal/ai/branches")
      .then((res) => (res.ok ? res.json() : { branches: [] }))
      .then((data: { branches?: BranchOption[] }) => {
        if (!cancelled) setBranches(data.branches ?? []);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedBranch = branches.find((b) => b.id === props.context?.branchId);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs",
        props.className,
      )}
    >
      <span className="font-medium text-muted-foreground">Context</span>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Branch</span>
        <select
          className="h-7 max-w-[16rem] rounded-md border bg-background px-2"
          value={props.context?.branchId ?? ""}
          title={
            selectedBranch
              ? `${selectedBranch.name} (${selectedBranch.sapCode})`
              : "Active branch for tools; updates when a tool returns a specific branch."
          }
          onChange={(event) => {
            const branchId = event.target.value || null;
            props.onChange({
              ...(props.context ?? {}),
              branchId,
            });
          }}
        >
          <option value="">None</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name} ({branch.sapCode})
            </option>
          ))}
        </select>
      </label>
      {props.context?.pathname ? (
        <span className="rounded-full border bg-background px-2 py-0.5">
          {props.context.pathname}
        </span>
      ) : null}
      {props.context?.recordType ? (
        <span className="rounded-full border bg-background px-2 py-0.5">
          {props.context.recordType}
          {props.context.recordId ? `: ${props.context.recordId}` : ""}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-7 gap-1 px-2"
        onClick={() => props.onChange(null)}
      >
        <X className="size-3.5" />
        Clear context
      </Button>
    </div>
  );
}
