"use client";

import { useState } from "react";
import Link from "next/link";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { WeekdayPicker } from "@/components/ui/weekday-picker";
import { formatWeekdayList, lockedOrderDays } from "@/features/orders/utils/order-window";
import {
  FREQUENCY_LABELS,
  type DeliveryFrequencyValue,
} from "@/features/frequency-codes/constants";
import { suggestScheduleDays } from "@/features/frequency-codes/lib/suggest-schedule-days";

export interface FrequencyCodeOption {
  id: string;
  code: string;
  frequency: string;
  description: string;
}

export interface BranchScheduleState {
  enabled: boolean;
  frequencyCodeId: string;
  deliveryDays: number[];
  orderDays: number[];
  notes: string;
}

export const EMPTY_SCHEDULE: BranchScheduleState = {
  enabled: false,
  frequencyCodeId: "",
  deliveryDays: [],
  orderDays: [],
  notes: "",
};

/** Build the server payload, or `null` when the schedule is disabled. */
export function buildSchedulePayload(s: BranchScheduleState) {
  if (!s.enabled) return null;
  return {
    frequencyCodeId: s.frequencyCodeId,
    deliveryDays: s.deliveryDays,
    orderDays: s.orderDays,
    notes: s.notes.trim() || null,
  };
}

interface BranchScheduleFieldsProps {
  value: BranchScheduleState;
  onChange: (next: BranchScheduleState) => void;
  frequencyCodes: FrequencyCodeOption[];
  globalLockedWeekdays?: number[];
  canManageOrderingPolicy?: boolean;
  disabled?: boolean;
}

export function BranchScheduleFields({
  value,
  onChange,
  frequencyCodes,
  globalLockedWeekdays = [],
  canManageOrderingPolicy = false,
  disabled,
}: BranchScheduleFieldsProps) {
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);

  function patch(next: Partial<BranchScheduleState>) {
    onChange({ ...value, ...next });
  }

  function onFrequencyCodeChange(nextId: string) {
    const selected = frequencyCodes.find((c) => c.id === nextId);
    if (!selected) {
      setSuggestionNote(null);
      patch({ frequencyCodeId: nextId });
      return;
    }
    const suggested = suggestScheduleDays({
      frequency: selected.frequency,
      globalLockedWeekdays,
    });
    setSuggestionNote(
      `Suggested from ${selected.code} and company locked days — adjust if needed.`,
    );
    patch({
      frequencyCodeId: nextId,
      deliveryDays: suggested.deliveryDays,
      orderDays: suggested.orderDays,
    });
  }

  const locked = value.orderDays.length > 0 ? lockedOrderDays(value.orderDays) : [];
  const selectedCode = frequencyCodes.find((c) => c.id === value.frequencyCodeId);
  const companyLockedLabel = formatWeekdayList(globalLockedWeekdays);
  const orderingPolicyHint =
    canManageOrderingPolicy ? (
      <>
        <Link href="/settings/ordering" className="underline underline-offset-2">
          Settings → Ordering policy
        </Link>
      </>
    ) : (
      <span>/settings/ordering</span>
    );

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={value.enabled}
          onCheckedChange={(c) => {
            setSuggestionNote(null);
            patch({ enabled: c === true });
          }}
          disabled={disabled}
        />
        Delivery &amp; ordering schedule
      </label>

      {value.enabled ? (
        <div className="space-y-3">
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Company policy locks {companyLockedLabel} for all branches (create and
            approve). Branch ordering days below further limit create/submit only.{" "}
            {orderingPolicyHint}.
          </p>

          {frequencyCodes.length === 0 ? (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              No frequency codes configured yet. Add them in Settings → Ordering
              policy first.
            </p>
          ) : (
            <div className="space-y-1.5">
              <SearchableSelect
                label="Frequency code"
                options={frequencyCodes.map((c) => ({
                  id: c.id,
                  label: c.code,
                  description: c.description,
                }))}
                value={value.frequencyCodeId}
                onChange={onFrequencyCodeChange}
                placeholder="Select a code…"
                searchPlaceholder="Search codes…"
                disabled={disabled}
              />
              {selectedCode ? (
                <p className="text-xs text-muted-foreground">
                  {FREQUENCY_LABELS[selectedCode.frequency as DeliveryFrequencyValue] ??
                    selectedCode.frequency}{" "}
                  — {selectedCode.description}
                </p>
              ) : null}
              {suggestionNote ? (
                <p className="text-xs text-muted-foreground">{suggestionNote}</p>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Delivery day(s)</Label>
            <WeekdayPicker
              value={value.deliveryDays}
              onChange={(days) => patch({ deliveryDays: days })}
              disabledDays={globalLockedWeekdays}
              disabled={disabled}
            />
            {globalLockedWeekdays.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Company-locked days cannot be selected.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Ordering day(s)</Label>
            <WeekdayPicker
              value={value.orderDays}
              onChange={(days) => patch({ orderDays: days })}
              disabledDays={globalLockedWeekdays}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              {value.orderDays.length > 0
                ? `Ordering locked on: ${formatWeekdayList(locked)}.`
                : "Select the days customers may place orders. The rest are locked."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule-notes">Notes</Label>
            <Textarea
              id="schedule-notes"
              value={value.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Optional context or remarks."
              disabled={disabled}
              rows={2}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            No schedule set — orders can be placed any day (subject to the global
            ordering policy).
          </p>
          <p>
            Company locked days: {companyLockedLabel} ({orderingPolicyHint}).
          </p>
        </div>
      )}
    </div>
  );
}
