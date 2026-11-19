"use client";

import {
  formatInventoryDrDate,
  formatInventoryStatusUpdated,
} from "@/app/(app)/inventory/_components/inventory-list-format";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { ScInventoryUnitDto } from "@/features/service-center-ops/actions/sc-inventory.actions";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function ScInventoryUnitDrawer({
  unit,
  onOpenChange,
}: {
  unit: ScInventoryUnitDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={unit != null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        {unit ? (
          <>
            <SheetHeader className="text-left">
              <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                Unit details
              </p>
              <SheetTitle className="font-mono text-2xl tracking-tight">{unit.serialNo}</SheetTitle>
              <SheetDescription>
                {unit.model.sku} · {unit.model.name}
              </SheetDescription>
              <div className="mt-3 space-y-2">
                <StatusCodeBadge
                  code={unit.status.code}
                  name={unit.status.name}
                  color={unit.status.color ?? undefined}
                  showCode
                />
                <p className="text-xs text-muted-foreground">
                  Last updated{" "}
                  <span className="font-medium text-foreground">
                    {formatInventoryStatusUpdated(unit.updatedAt)}
                  </span>
                </p>
              </div>
            </SheetHeader>

            <div className="flex-1 px-4 pb-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Service center" value={`${unit.center.name} · ${unit.center.sapCode}`} />
                <Detail label="Location" value={`${unit.location.code} · ${unit.location.name}`} />
                <Detail label="Model" value={unit.model.sku} />
                <Detail label="Series" value={unit.model.series ?? "Not recorded"} />
                <Detail label="Aging" value={unit.agingDays === 1 ? "1 day" : `${unit.agingDays} days`} />
                <Detail label="DR no." value={unit.drNo ?? "Not recorded"} />
                <Detail label="DR date" value={unit.drDate ? formatInventoryDrDate(unit.drDate) : "Not recorded"} />
              </dl>
            </div>

            <SheetFooter className="border-t px-4 py-4">
              <p className="text-center text-xs text-muted-foreground">
                Service center stock is view only. Units change through deliveries, sales and pull-outs.
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                Close details
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
