"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { displayPeriodLabel } from "@/features/demand-planning/lib/planning-period-dates";
import type { CoveragePeriodOption } from "@/features/demand-planning/services/coverage.service";

interface CoveragePeriodSelectProps {
  periods: CoveragePeriodOption[];
  selectedPeriodId: string;
}

export function CoveragePeriodSelect({
  periods,
  selectedPeriodId,
}: CoveragePeriodSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(periodId: string) {
    if (!periodId || periodId === selectedPeriodId) return;
    startTransition(() => {
      const params = new URLSearchParams();
      params.set("period", periodId);
      router.push(`/reports/demand-planning?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <SearchableSelect
      id="coverage-period"
      className="w-full"
      options={periods.map((period) => {
        const label = displayPeriodLabel(period.label);
        return {
          id: period.id,
          label: period.isActive ? `${label} (active)` : label,
        };
      })}
      value={selectedPeriodId}
      onChange={handleChange}
      placeholder={periods.length === 0 ? "No periods" : "Select period…"}
      searchPlaceholder="Search periods…"
      emptyMessage="No planning periods yet."
      disabled={pending || periods.length === 0}
    />
  );
}
