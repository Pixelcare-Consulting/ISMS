"use client";

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
  disabled?: boolean;
}

export function BranchScheduleFields({
  value,
  onChange,
  frequencyCodes,
  disabled,
}: BranchScheduleFieldsProps) {
  function patch(next: Partial<BranchScheduleState>) {
    onChange({ ...value, ...next });
  }

  const locked = value.orderDays.length > 0 ? lockedOrderDays(value.orderDays) : [];
  const selectedCode = frequencyCodes.find((c) => c.id === value.frequencyCodeId);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={value.enabled}
          onCheckedChange={(c) => patch({ enabled: c === true })}
          disabled={disabled}
        />
        Delivery &amp; ordering schedule
      </label>

      {value.enabled ? (
        <div className="space-y-3">
          {frequencyCodes.length === 0 ? (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              No frequency codes configured yet. Add them in Settings → Ordering policy first.
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
                onChange={(v) => patch({ frequencyCodeId: v })}
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
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Delivery day(s)</Label>
            <WeekdayPicker
              value={value.deliveryDays}
              onChange={(days) => patch({ deliveryDays: days })}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Ordering day(s)</Label>
            <WeekdayPicker
              value={value.orderDays}
              onChange={(days) => patch({ orderDays: days })}
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
              placeholder="Optional context or client remarks."
              disabled={disabled}
              rows={2}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No schedule set — orders can be placed any day (subject to the global ordering policy).
        </p>
      )}
    </div>
  );
}
