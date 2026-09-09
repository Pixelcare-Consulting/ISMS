"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { activatePlanningPeriodAction } from "@/features/forecast/actions/forecast.actions";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface PlanningPeriodOption {
  id: string;
  label: string;
  isActive: boolean;
}

interface PlanningPeriodSelectProps {
  periods: PlanningPeriodOption[];
  selectedPeriodId: string;
  preserveParams?: Record<string, string>;
}

function buildPeriodHref(periodId: string, preserveParams: Record<string, string> = {}) {
  const params = new URLSearchParams(preserveParams);
  params.set("period", periodId);
  params.delete("page");
  const qs = params.toString();
  return `/settings/planning?${qs}`;
}

export function PlanningPeriodSelect({
  periods,
  selectedPeriodId,
  preserveParams,
}: PlanningPeriodSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(periodId: string) {
    if (!periodId || periodId === selectedPeriodId) return;
    startTransition(async () => {
      const result = await activatePlanningPeriodAction(periodId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push(buildPeriodHref(periodId, preserveParams));
      router.refresh();
    });
  }

  return (
    <SearchableSelect
      id="planning-period"
      className="w-full"
      options={periods.map((period) => ({
        id: period.id,
        label: period.isActive ? `${period.label} (active)` : period.label,
      }))}
      value={selectedPeriodId}
      onChange={handleChange}
      placeholder={periods.length === 0 ? "No periods" : "Select period…"}
      searchPlaceholder="Search periods…"
      emptyMessage="No planning periods yet."
      disabled={pending || periods.length === 0}
    />
  );
}
