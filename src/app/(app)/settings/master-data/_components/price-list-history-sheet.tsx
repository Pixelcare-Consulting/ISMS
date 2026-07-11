"use client";

import { Trash2 } from "lucide-react";

import type { PriceListCardRow } from "@/app/(app)/settings/master-data/_components/price-list-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPeso } from "@/utils/format-currency";

interface PriceListHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skuCode: string;
  modelName: string;
  rows: PriceListCardRow[];
  onDelete: (row: PriceListCardRow) => void;
}

export function PriceListHistorySheet({
  open,
  onOpenChange,
  skuCode,
  modelName,
  rows,
  onDelete,
}: PriceListHistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
          <SheetTitle className="font-mono">{skuCode}</SheetTitle>
          <SheetDescription>{modelName}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No price periods for this model.
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold tabular-nums text-foreground">
                      {formatPeso(row.amount)}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {row.periodStart} → {row.periodEnd}
                    </p>
                    {row.packageType ? (
                      <Badge
                        variant="secondary"
                        className="h-5 rounded-md px-1.5 text-[10px] font-medium"
                      >
                        {row.packageType.name}
                      </Badge>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-destructive hover:text-destructive"
                    aria-label={`Remove price row for ${row.periodStart}`}
                    onClick={() => onDelete(row)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="border-t border-border/60">
          <Button
            type="button"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
