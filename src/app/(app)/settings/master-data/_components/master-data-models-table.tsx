"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createModelAction,
  listBrandsAction,
  listCategoriesAction,
  updateModelStatusAction,
} from "@/features/master-data/actions/master-data.actions";
import type { ClientModelRow } from "@/features/master-data/types/client-model";
import { AppDataTable, AppDataTableBody, DataTableEmpty } from "@/components/data-table";
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

export function MasterDataModelsTable({ models }: { models: ClientModelRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [skuCode, setSkuCode] = useState("");
  const [name, setName] = useState("");
  const [options, setOptions] = useState<{
    brands: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  } | null>(null);

  async function loadOptions() {
    if (options) return;
    const [brands, categories] = await Promise.all([
      listBrandsAction(),
      listCategoriesAction(),
    ]);
    setOptions({ brands, categories });
    if (brands[0]) setBrandId(brands[0].id);
    if (categories[0]) setCategoryId(categories[0].id);
  }

  function addModel() {
    startTransition(async () => {
      const result = await createModelAction({ brandId, categoryId, skuCode, name });
      if (result.error) {
        toast.error("Could not add model");
        return;
      }
      toast.success("Model added");
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
          </>
        ) : (
          <Button variant="secondary" type="button" onClick={loadOptions}>
            Load brand/category lists
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

      {models.length === 0 ? (
        <DataTableEmpty message="No product models yet." />
      ) : (
        <AppDataTable title="Product models">
          <AppDataTableBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">SRP</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.skuCode}</TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.brand?.name ?? "—"}</TableCell>
                    <TableCell>{m.category?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(m.srp)}
                    </TableCell>
                    <TableCell>
                      <ModelStatusSelect modelId={m.id} status={m.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AppDataTableBody>
        </AppDataTable>
      )}
    </div>
  );
}

const SKU_STATUSES = ["active", "hold", "retired"] as const;

function ModelStatusSelect({ modelId, status }: { modelId: string; status: string }) {
  const router = useRouter();
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
      router.refresh();
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
