"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { WeekdayPicker } from "@/components/ui/weekday-picker";
import { formatWeekdayList, lockedOrderDays } from "@/features/orders/utils/order-window";
import { DELIVERY_FREQUENCIES } from "@/features/branches/schemas/branch.schema";

export interface BranchScheduleState {
  enabled: boolean;
  fCode: string;
  frequency: (typeof DELIVERY_FREQUENCIES)[number];
  deliveryDays: number[];
  orderDays: number[];
  notes: string;
}

export const EMPTY_SCHEDULE: BranchScheduleState = {
  enabled: false,
  fCode: "",
  frequency: "weekly",
  deliveryDays: [],
  orderDays: [],
  notes: "",
};

const FREQUENCY_OPTIONS = [
  { id: "weekly", label: "Weekly — once a week (F4)" },
  { id: "biweekly", label: "Every 2 weeks (F2)" },
  { id: "triweekly", label: "Every 3 weeks (F3)" },
  { id: "monthly", label: "Monthly — once a month (F1)" },
  { id: "twice_weekly", label: "Twice a week (F8)" },
];

/** Build the server payload, or `null` when the schedule is disabled. */
export function buildSchedulePayload(s: BranchScheduleState) {
  if (!s.enabled) return null;
  return {
    fCode: s.fCode.trim() || null,
    frequency: s.frequency,
    deliveryDays: s.deliveryDays,
    orderDays: s.orderDays,
    notes: s.notes.trim() || null,
  };
}

interface BranchScheduleFieldsProps {
  value: BranchScheduleState;
  onChange: (next: BranchScheduleState) => void;
  disabled?: boolean;
}

export function BranchScheduleFields({ value, onChange, disabled }: BranchScheduleFieldsProps) {
  function patch(next: Partial<BranchScheduleState>) {
    onChange({ ...value, ...next });
  }

  const locked = value.orderDays.length > 0 ? lockedOrderDays(value.orderDays) : [];

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
          <div className="grid grid-cols-2 gap-2">
            <SearchableSelect
              label="Frequency"
              options={FREQUENCY_OPTIONS}
              value={value.frequency}
              onChange={(v) => patch({ frequency: v as BranchScheduleState["frequency"] })}
              searchPlaceholder="Search frequency…"
              disabled={disabled}
            />
            <div className="space-y-2">
              <Label htmlFor="schedule-fcode">F-code</Label>
              <Input
                id="schedule-fcode"
                value={value.fCode}
                onChange={(e) => patch({ fCode: e.target.value })}
                placeholder="e.g. F4"
                disabled={disabled}
              />
            </div>
          </div>

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
