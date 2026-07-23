"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateOrderingPolicyAction } from "@/features/ordering/actions/ordering-policy.actions";
import { formatWeekdayList } from "@/features/orders/utils/order-window";
import { Button } from "@/components/ui/button";
import { WeekdayPicker } from "@/components/ui/weekday-picker";

interface OrderingPolicyFormProps {
  initialLockedWeekdays: number[];
  canEdit: boolean;
}

export function OrderingPolicyForm({
  initialLockedWeekdays,
  canEdit,
}: OrderingPolicyFormProps) {
  const [lockedWeekdays, setLockedWeekdays] = useState<number[]>(initialLockedWeekdays);
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const result = await updateOrderingPolicyAction({ globalLockedWeekdays: lockedWeekdays });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Ordering policy updated");
    });
  }

  return (
    <div className="space-y-4">
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
      {canEdit ? (
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save policy"}
        </Button>
      ) : null}
    </div>
  );
}
