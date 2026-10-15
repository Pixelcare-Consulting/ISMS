"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  listSeriesAction,
  updateModelSeriesAction,
} from "@/features/master-data/actions/master-data.actions";
import type { ClientModelRow } from "@/features/master-data/types/client-model";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ModelSeriesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ClientModelRow;
}

export function ModelSeriesSheet({ open, onOpenChange, model }: ModelSeriesSheetProps) {
  const router = useRouter();
  const [seriesOptions, setSeriesOptions] = useState<{ id: string; name: string }[]>([]);
  const [seriesId, setSeriesId] = useState(model.series?.id ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listSeriesAction()
      .then((rows) => {
        if (!cancelled) setSeriesOptions(rows);
      })
      .catch(() => toast.error("Could not load series"));
    return () => {
      cancelled = true;
    };
  }, []);

  const unchanged = seriesId === (model.series?.id ?? "");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateModelSeriesAction({
        modelId: model.id,
        seriesId: seriesId || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Series updated");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
          <SheetTitle className="font-mono">{model.skuCode}</SheetTitle>
          <SheetDescription>
            {model.name}. Current series: {model.series?.name ?? "not set"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <SearchableSelect
              label="Series"
              id="model-series-edit"
              options={seriesOptions.map((row) => ({ id: row.id, label: row.name }))}
              value={seriesId}
              onChange={setSeriesId}
              allowClear
              placeholder="No series"
              searchPlaceholder="Search series…"
              disabled={pending}
            />
          </div>
          <SheetFooter className="border-t border-border/60">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || unchanged}>
              Save series
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
