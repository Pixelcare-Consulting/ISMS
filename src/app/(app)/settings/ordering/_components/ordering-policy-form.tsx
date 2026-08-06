"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateOrderingPolicyAction } from "@/features/ordering/actions/ordering-policy.actions";
import {
  formatMinutesAsClock,
  formatWeekdayList,
  minutesToTimeValue,
  timeValueToMinutes,
} from "@/features/orders/utils/order-window";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WeekdayPicker } from "@/components/ui/weekday-picker";

interface OrderingPolicyFormProps {
  initialLockedWeekdays: number[];
  initialDailyLockEnabled: boolean;
  initialDailyLockStartMinutes: number | null;
  initialDailyLockEndMinutes: number | null;
  canEdit: boolean;
}

export function OrderingPolicyForm({
  initialLockedWeekdays,
  initialDailyLockEnabled,
  initialDailyLockStartMinutes,
  initialDailyLockEndMinutes,
  canEdit,
}: OrderingPolicyFormProps) {
  const [lockedWeekdays, setLockedWeekdays] = useState<number[]>(initialLockedWeekdays);
  const [dailyLockEnabled, setDailyLockEnabled] = useState(initialDailyLockEnabled);
  const [startTime, setStartTime] = useState(
    initialDailyLockStartMinutes != null
      ? minutesToTimeValue(initialDailyLockStartMinutes)
      : "09:00",
  );
  const [endTime, setEndTime] = useState(
    initialDailyLockEndMinutes != null
      ? minutesToTimeValue(initialDailyLockEndMinutes)
      : "17:00",
  );
  const [pending, startTransition] = useTransition();

  function onSave() {
    const startMinutes = timeValueToMinutes(startTime);
    const endMinutes = timeValueToMinutes(endTime);

    if (dailyLockEnabled) {
      if (startMinutes == null || endMinutes == null) {
        toast.error("Enter valid start and end times for the daily time lock.");
        return;
      }
      if (startMinutes >= endMinutes) {
        toast.error("Start time must be earlier than end time (same-day window).");
        return;
      }
    }

    startTransition(async () => {
      const result = await updateOrderingPolicyAction({
        globalLockedWeekdays: lockedWeekdays,
        dailyLockEnabled,
        dailyLockStartMinutes: startMinutes,
        dailyLockEndMinutes: endMinutes,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Ordering policy updated");
    });
  }

  const startMinutesPreview = timeValueToMinutes(startTime);
  const endMinutesPreview = timeValueToMinutes(endTime);
  const timeWindowLabel =
    startMinutesPreview != null &&
    endMinutesPreview != null &&
    startMinutesPreview < endMinutesPreview
      ? `${formatMinutesAsClock(startMinutesPreview)}–${formatMinutesAsClock(endMinutesPreview)}`
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Locked ordering days</p>
        <p className="text-sm text-muted-foreground">
          On these days no order can be created, submitted for approval, or approved — for every
          branch. Leave Sunday selected to keep the standard weekend lock.
        </p>
        <WeekdayPicker
          value={lockedWeekdays}
          onChange={setLockedWeekdays}
          disabled={!canEdit || pending}
        />
        <p className="text-xs text-muted-foreground">
          {lockedWeekdays.length > 0
            ? `Locked on: ${formatWeekdayList(lockedWeekdays)}.`
            : "No global locks — branches follow their own ordering windows only."}
        </p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Daily time lock</p>
          <p className="text-sm text-muted-foreground">
            Block create, submit, and approve during a daily window in Manila time. At the end time,
            ordering is allowed again. Locked weekdays still apply for the whole day.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={dailyLockEnabled}
            onCheckedChange={(v) => setDailyLockEnabled(v === true)}
            disabled={!canEdit || pending}
          />
          Enable daily time lock
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="daily-lock-start">Start (block from)</Label>
            <Input
              id="daily-lock-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={!canEdit || pending || !dailyLockEnabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="daily-lock-end">End (allow again at)</Label>
            <Input
              id="daily-lock-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!canEdit || pending || !dailyLockEnabled}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {dailyLockEnabled
            ? timeWindowLabel
              ? `Orders cannot be created, submitted, or approved between ${timeWindowLabel} (Asia/Manila).`
              : "Choose a same-day start earlier than end."
            : "Daily time lock is off — only weekday locks and branch schedules apply."}
        </p>
      </div>

      {canEdit ? (
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save policy"}
        </Button>
      ) : null}
    </div>
  );
}
