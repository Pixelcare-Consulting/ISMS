"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createModelAction,
  listBrandsAction,
  listCategoriesAction,
  listModelFormLookupsAction,
  updateModelStatusAction,
} from "@/features/master-data/actions/master-data.actions";
import type { ClientModelRow } from "@/features/master-data/types/client-model";
import {
  DataTableEmptyState,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso } from "@/utils/format-currency";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

const COL_COUNT = 8;

export function MasterDataModelsTable({ models }: { models: ClientModelRow[] }) {
  const router = useRouter();
  const [optimisticRows, setOptimisticRows] = useState<ClientModelRow[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [featureId, setFeatureId] = useState("");
  const [resolutionId, setResolutionId] = useState("");
  const [actualSizeId, setActualSizeId] = useState("");
  const [skuCode, setSkuCode] = useState("");
  const [name, setName] = useState("");
  const [options, setOptions] = useState<{
    brands: { id: string; name: string }[];
    categories: { id: string; name: string }[];
    features: { id: string; name: string }[];
    resolutions: { id: string; name: string }[];
    actualSizes: { id: string; name: string }[];
  } | null>(null);

  const rows = useMemo(() => {
    const modelIds = new Set(models.map((model) => model.id));
    const merged = [...optimisticRows.filter((row) => !modelIds.has(row.id)), ...models];
    return merged.map((row) => ({
      ...row,
      status: statusOverrides[row.id] ?? row.status,
    }));
  }, [models, optimisticRows, statusOverrides]);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.skuCode,
          row.name,
          row.brand?.name ?? "",
          row.category?.name ?? "",
          row.status,
        ]),
      ),
    [rows, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.skuCode),
        rows.map((row) => row.name),
        rows.map((row) => row.brand?.name),
        rows.map((row) => row.category?.name),
        rows.map((row) => row.status),
      ),
    [rows],
  );

  const selection = useTableSelection(filtered.map((model) => model.id));
  const {
    page,
    setPage,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(filtered, { pageSize: 10, resetKey: query });

  async function loadOptions() {
    if (options) return options;
    const [brands, categories, lookups] = await Promise.all([
      listBrandsAction(),
      listCategoriesAction(),
      listModelFormLookupsAction(),
    ]);
    const next = {
      brands,
      categories,
      features: lookups.features,
      resolutions: lookups.resolutions,
      actualSizes: lookups.actualSizes,
    };
    setOptions(next);
    if (brands[0]) setBrandId(brands[0].id);
    if (categories[0]) setCategoryId(categories[0].id);
    return next;
  }

  function resetAddForm() {
    setFeatureId("");
    setResolutionId("");
    setActualSizeId("");
    setSkuCode("");
    setName("");
    if (options?.brands[0]) setBrandId(options.brands[0].id);
    else setBrandId("");
    if (options?.categories[0]) setCategoryId(options.categories[0].id);
    else setCategoryId("");
  }

  function onAddOpenChange(open: boolean) {
    setAddOpen(open);
    if (open) {
      void loadOptions();
    } else {
      resetAddForm();
    }
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const loaded = options ?? (await loadOptions());
      const result = await createModelAction({
        brandId,
        categoryId,
        featureId: featureId || undefined,
        resolutionId: resolutionId || undefined,
        actualSizeId: actualSizeId || undefined,
        skuCode,
        name,
      });
      if (result.error) {
        toast.error("Could not add model");
        return;
      }
      toast.success("Model added");
      if (result.model) {
        const selectedBrand = loaded?.brands.find((brand) => brand.id === brandId);
        const selectedCategory = loaded?.categories.find(
          (category) => category.id === categoryId,
        );
        setOptimisticRows((currentRows) => [
          {
            id: result.model.id,
            skuCode: result.model.skuCode,
            name: result.model.name,
            status: result.model.status,
            srp: null,
            cbm: null,
            brand: selectedBrand ? { name: selectedBrand.name } : null,
            category: selectedCategory ? { name: selectedCategory.name } : null,
          },
          ...currentRows,
        ]);
      }
      onAddOpenChange(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" size="sm" onClick={() => onAddOpenChange(true)}>
              <Plus className="size-3.5" />
              Add model
            </Button>
          </div>
          <DataTableEmptyState message="No product models yet." />
        </div>
      ) : (
        <GlobalDataTable
          stickyHeader
          toolbarLeading={
            <span className="text-sm font-medium">Product models</span>
          }
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "Search models by SKU, name, brand…",
            suggestions,
          }}
          toolbarActions={
            <>
              <TableSelectionBadge
                count={selection.selectedCount}
                onClear={selection.clearSelection}
                size="sm"
              />
              <Button type="button" size="sm" onClick={() => onAddOpenChange(true)}>
                <Plus className="size-3.5" />
                Add model
              </Button>
            </>
          }
          pagination={{
            total,
            page,
            totalPages,
            itemLabel: "model",
            onPageChange: setPage,
          }}
        >
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableSelectAllCheckbox
                    isAllSelected={selection.isAllSelected}
                    isPartiallySelected={selection.isPartiallySelected}
                    onToggleAll={selection.toggleAll}
                    aria-label="Select all models"
                  />
                  <TableIndexHead />
                  <GlobalTableHead>SKU</GlobalTableHead>
                  <GlobalTableHead>Name</GlobalTableHead>
                  <GlobalTableHead>Brand</GlobalTableHead>
                  <GlobalTableHead>Category</GlobalTableHead>
                  <GlobalTableHead className="text-right">SRP</GlobalTableHead>
                  <GlobalTableHead>Status</GlobalTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={COL_COUNT}
                    message="No models match your search."
                  />
                ) : (
                  pageItems.map((m, index) => (
                    <TableRow
                      key={m.id}
                      data-state={selection.isRowSelected(m.id) ? "selected" : undefined}
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
                    >
                      <TableRowCheckbox
                        checked={selection.isRowSelected(m.id)}
                        onCheckedChange={(checked) => selection.toggleRow(m.id, checked)}
                        aria-label={`Select model ${m.skuCode}`}
                      />
                      <TableIndexCell index={indexOffset + index + 1} />
                      <TableCell className="font-mono text-sm">{m.skuCode}</TableCell>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.brand?.name ?? "—"}</TableCell>
                      <TableCell>{m.category?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPeso(m.srp)}
                      </TableCell>
                      <TableCell>
                        <ModelStatusSelect
                          modelId={m.id}
                          status={m.status}
                          onUpdated={(nextStatus) => {
                            setStatusOverrides((current) => ({
                              ...current,
                              [m.id]: nextStatus,
                            }));
                            router.refresh();
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
        </GlobalDataTable>
      )}

      <Sheet open={addOpen} onOpenChange={onAddOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>Add model</SheetTitle>
            <SheetDescription>
              Create a product model with brand, category, and optional lookups.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <SearchableSelect
                label="Brand"
                id="model-brand"
                options={(options?.brands ?? []).map((b) => ({
                  id: b.id,
                  label: b.name,
                }))}
                value={brandId}
                onChange={setBrandId}
                placeholder="Select brand…"
                searchPlaceholder="Search brands…"
                disabled={pending}
              />
              <SearchableSelect
                label="Category"
                id="model-category"
                options={(options?.categories ?? []).map((c) => ({
                  id: c.id,
                  label: c.name,
                }))}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Select category…"
                searchPlaceholder="Search categories…"
                disabled={pending}
              />
              <SearchableSelect
                label="Feature"
                id="model-feature"
                options={(options?.features ?? []).map((c) => ({
                  id: c.id,
                  label: c.name,
                }))}
                value={featureId}
                onChange={setFeatureId}
                allowClear
                placeholder="—"
                searchPlaceholder="Search features…"
                disabled={pending}
              />
              <SearchableSelect
                label="Resolution"
                id="model-resolution"
                options={(options?.resolutions ?? []).map((c) => ({
                  id: c.id,
                  label: c.name,
                }))}
                value={resolutionId}
                onChange={setResolutionId}
                allowClear
                placeholder="—"
                searchPlaceholder="Search resolutions…"
                disabled={pending}
              />
              <SearchableSelect
                label="Actual size"
                id="model-actual-size"
                options={(options?.actualSizes ?? []).map((c) => ({
                  id: c.id,
                  label: c.name,
                }))}
                value={actualSizeId}
                onChange={setActualSizeId}
                allowClear
                placeholder="—"
                searchPlaceholder="Search sizes…"
                disabled={pending}
              />
              <div className="space-y-2">
                <Label htmlFor="model-sku">SKU</Label>
                <Input
                  id="model-sku"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model-name">Name</Label>
                <Input
                  id="model-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => onAddOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !brandId || !categoryId || !skuCode || !name}>
                Add model
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const SKU_STATUSES = ["active", "hold", "retired"] as const;

function ModelStatusSelect({
  modelId,
  status,
  onUpdated,
}: {
  modelId: string;
  status: string;
  onUpdated?: (status: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const result = await updateModelStatusAction({
        modelId,
        status: next as (typeof SKU_STATUSES)[number],
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("SKU status updated");
      onUpdated?.(next);
    });
  }

  return (
    <SearchableSelect
      className="min-w-[7rem] capitalize"
      options={SKU_STATUSES.map((s) => ({
        id: s,
        label: s,
      }))}
      value={status}
      disabled={pending}
      searchPlaceholder="Search status…"
      onChange={onChange}
    />
  );
}
