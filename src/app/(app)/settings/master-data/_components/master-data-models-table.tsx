"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
  AppDataTable,
  AppDataTableBody,
  DataTableEmptyState,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowCheckbox,
  TableSearchBar,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useTableSelection,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
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

  async function loadOptions() {
    if (options) return;
    const [brands, categories, lookups] = await Promise.all([
      listBrandsAction(),
      listCategoriesAction(),
      listModelFormLookupsAction(),
    ]);
    setOptions({
      brands,
      categories,
      features: lookups.features,
      resolutions: lookups.resolutions,
      actualSizes: lookups.actualSizes,
    });
    if (brands[0]) setBrandId(brands[0].id);
    if (categories[0]) setCategoryId(categories[0].id);
  }

  function addModel() {
    startTransition(async () => {
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
        const selectedBrand = options?.brands.find((brand) => brand.id === brandId);
        const selectedCategory = options?.categories.find(
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
      setSkuCode("");
      setName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-2 rounded-xl border bg-card p-4 shadow-sm"
        onFocus={loadOptions}
      >
        {options ? (
          <>
            <div>
              <Label>Brand</Label>
              <select
                className="flex h-9 cursor-pointer rounded-md border bg-background px-2 text-sm"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
              >
                {options.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Category</Label>
              <select
                className="flex h-9 cursor-pointer rounded-md border bg-background px-2 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Feature</Label>
              <select
                className="flex h-9 cursor-pointer rounded-md border bg-background px-2 text-sm"
                value={featureId}
                onChange={(e) => setFeatureId(e.target.value)}
              >
                <option value="">—</option>
                {options.features.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Resolution</Label>
              <select
                className="flex h-9 cursor-pointer rounded-md border bg-background px-2 text-sm"
                value={resolutionId}
                onChange={(e) => setResolutionId(e.target.value)}
              >
                <option value="">—</option>
                {options.resolutions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Actual size</Label>
              <select
                className="flex h-9 cursor-pointer rounded-md border bg-background px-2 text-sm"
                value={actualSizeId}
                onChange={(e) => setActualSizeId(e.target.value)}
              >
                <option value="">—</option>
                {options.actualSizes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <Button variant="secondary" type="button" onClick={loadOptions}>
            Load lookup lists
          </Button>
        )}
        <div>
          <Label>SKU</Label>
          <Input value={skuCode} onChange={(e) => setSkuCode(e.target.value)} />
        </div>
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button className="self-end" disabled={pending || !brandId} onClick={addModel}>
          Add model
        </Button>
      </div>

      {rows.length === 0 ? (
        <DataTableEmptyState message="No product models yet." />
      ) : (
        <AppDataTable
          title="Product models"
          shellHeader={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TableSearchBar
                value={query}
                onChange={setQuery}
                placeholder="Search models by SKU, name, brand…"
                suggestions={suggestions}
                className="sm:max-w-sm"
              />
              <TableSelectionBadge
                count={selection.selectedCount}
                onClear={selection.clearSelection}
                size="sm"
              />
            </div>
          }
        >
          <AppDataTableBody>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableSelectAllCheckbox
                    isAllSelected={selection.isAllSelected}
                    isPartiallySelected={selection.isPartiallySelected}
                    onToggleAll={selection.toggleAll}
                    aria-label="Select all models"
                  />
                  <TableIndexHead />
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">SRP</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={COL_COUNT}
                    message="No models match your search."
                  />
                ) : (
                  filtered.map((m, index) => (
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
                      <TableIndexCell index={index + 1} />
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
            </Table>
          </AppDataTableBody>
        </AppDataTable>
      )}
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
    <select
      className="flex h-8 cursor-pointer rounded-md border bg-background px-2 text-sm capitalize disabled:cursor-not-allowed disabled:opacity-50"
      value={status}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      aria-label="SKU status"
    >
      {SKU_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
