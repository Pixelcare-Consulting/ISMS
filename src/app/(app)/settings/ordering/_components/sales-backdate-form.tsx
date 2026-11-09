"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSalesBackdateDaysAction } from "@/features/ordering/actions/ordering-policy.actions";
import {
  describeTransactionDateWindow,
  MAX_SALES_BACKDATE_DAYS,
  salesTransactionDateWindow,
} from "@/features/sales/utils/transaction-date-window";

/** How many days back a new sales transaction may be dated. 0 allows today only. */
export function SalesBackdateForm({
  initialDays,
  canEdit,
}: {
  initialDays: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(initialDays));

  const parsed = Number(value);
  const valid =
    value.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_SALES_BACKDATE_DAYS;

  function save() {
    if (!valid) {
      toast.error(`Enter whole days from 0 to ${MAX_SALES_BACKDATE_DAYS}.`);
      return;
    }
    startTransition(async () => {
      const result = await updateSalesBackdateDaysAction({ days: parsed });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Sales transaction date rule saved");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="sales-backdate-days">Days back allowed</Label>
        <Input
          id="sales-backdate-days"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_SALES_BACKDATE_DAYS}
          step={1}
          className="w-32"
          value={value}
          disabled={!canEdit || pending}
          aria-invalid={!valid}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      {canEdit ? (
        <Button
          type="button"
          disabled={pending || !valid || parsed === initialDays}
          onClick={save}
        >
          Save
        </Button>
      ) : null}
      <p className="basis-full text-sm text-muted-foreground">
        {describeTransactionDateWindow(salesTransactionDateWindow(initialDays))} Future
        dates are never allowed.
      </p>
    </div>
  );
}
