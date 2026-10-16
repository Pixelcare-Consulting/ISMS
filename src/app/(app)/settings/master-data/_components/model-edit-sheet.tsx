"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  listBrandsAction,
  listModelFormLookupsAction,
  listSeriesAction,
  updateModelDetailsAction,
} from "@/features/master-data/actions/master-data.actions";
import type { ClientLookupRef, ClientModelRow } from "@/features/master-data/types/client-model";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ModelEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ClientModelRow;
}

type LookupRow = { id: string; name: string; recordStatus?: string };

const FIELDS = [
  { key: "brand", label: "Brand", plural: "brands", required: true },
  { key: "series", label: "Series", plural: "series", required: false },
  { key: "category", label: "Category", plural: "categories", required: false },
  { key: "feature", label: "Feature", plural: "features", required: false },
  { key: "resolution", label: "Resolution", plural: "resolutions", required: false },
  { key: "actualSize", label: "Actual size", plural: "sizes", required: false },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type FieldValues = Record<FieldKey, string>;

function currentValues(model: ClientModelRow): FieldValues {
  return {
    brand: model.brand?.id ?? "",
    series: model.series?.id ?? "",
    category: model.category?.id ?? "",
    feature: model.feature?.id ?? "",
    resolution: model.resolution?.id ?? "",
    actualSize: model.actualSize?.id ?? "",
  };
}

function isActive(row: LookupRow): boolean {
  return (row.recordStatus ?? "active") === "active";
}

/**
 * Active rows only, plus the model's current value even when it has been deactivated,
 * so the picker shows what is saved instead of going blank. The server accepts an
 * unchanged inactive value and refuses a newly picked one.
 */
function toOptions(rows: LookupRow[], current: ClientLookupRef | null): SearchableOption[] {
  const options = rows
    .filter((row) => isActive(row) || row.id === current?.id)
    .map((row) => ({ id: row.id, label: isActive(row) ? row.name : `${row.name} (inactive)` }));
  if (current && !options.some((option) => option.id === current.id)) {
    options.unshift({ id: current.id, label: `${current.name} (inactive)` });
  }
  return options;
}

export function ModelEditSheet({ open, onOpenChange, model }: ModelEditSheetProps) {
  const router = useRouter();
  const initial = currentValues(model);
  const [values, setValues] = useState<FieldValues>(initial);
  const [lookups, setLookups] = useState<Record<FieldKey, LookupRow[]> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    Promise.all([listBrandsAction(), listSeriesAction(), listModelFormLookupsAction()])
      .then(([brands, series, rest]) => {
        if (cancelled) return;
        setLookups({
          brand: brands,
          series,
          category: rest.categories,
          feature: rest.features,
          resolution: rest.resolutions,
          actualSize: rest.actualSizes,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error("Could not load master data");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unchanged = FIELDS.every(({ key }) => values[key] === initial[key]);
  const disabled = pending || !lookups;

  function setField(key: FieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateModelDetailsAction({
        modelId: model.id,
        brandId: values.brand,
        seriesId: values.series || null,
        categoryId: values.category || null,
        featureId: values.feature || null,
        resolutionId: values.resolution || null,
        actualSizeId: values.actualSize || null,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.sapWarning) toast.warning(result.sapWarning);
      else toast.success("Model updated");
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
            {model.name}. Values must already exist in Master data.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {loadFailed ? (
              <p className="text-destructive text-sm">
                Could not load master data. Close this panel and try again.
              </p>
            ) : null}
            {FIELDS.map((field) => (
              <SearchableSelect
                key={field.key}
                label={field.label}
                id={`model-edit-${field.key}`}
                options={toOptions(lookups?.[field.key] ?? [], model[field.key])}
                value={values[field.key]}
                onChange={(value) => setField(field.key, value)}
                allowClear={!field.required}
                placeholder={!lookups && !loadFailed ? "Loading…" : field.required ? `Select ${field.label.toLowerCase()}…` : "Not set"}
                searchPlaceholder={`Search ${field.plural}…`}
                emptyMessage={`No ${field.plural} in Master data.`}
                disabled={disabled}
              />
            ))}
          </div>
          <SheetFooter className="border-t border-border/60">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled || unchanged || !values.brand}>
              Save changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
