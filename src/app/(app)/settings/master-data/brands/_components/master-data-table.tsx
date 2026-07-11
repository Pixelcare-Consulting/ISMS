"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createBrandAction,
  createModelAction,
} from "@/features/master-data/actions/master-data.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AppDataTable,
  AppDataTableBody,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowCheckbox,
  TableSearchBar,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  TableStatusBadge,
  uniqueSearchSuggestions,
  useTableSelection,
} from "@/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

interface BrandRow {
  id: string;
  name: string;
  code: string | null;
  _count: { models: number };
}

interface ModelRow {
  id: string;
  skuCode: string;
  name: string;
  status: string;
  brand: { name: string } | null;
}

interface MasterDataTableProps {
  brands: BrandRow[];
  models: ModelRow[];
}

export function MasterDataTable({ brands, models }: MasterDataTableProps) {
  const router = useRouter();
  const [brandQuery, setBrandQuery] = useState("");
  const [query, setQuery] = useState("");
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const filteredBrands = useMemo(
    () =>
      brands.filter((brand) =>
        matchesTableSearch(brandQuery, [brand.name, brand.code ?? ""]),
      ),
    [brands, brandQuery],
  );

  const brandSuggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        brands.map((brand) => brand.name),
        brands.map((brand) => brand.code),
      ),
    [brands],
  );

  const brandSelection = useTableSelection(filteredBrands.map((brand) => brand.id));

  const filteredModels = useMemo(
    () =>
      models.filter((m) =>
        matchesTableSearch(query, [m.skuCode, m.name, m.brand?.name ?? ""]),
      ),
    [models, query],
  );

  const modelSuggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        models.map((m) => m.skuCode),
        models.map((m) => m.name),
        models.map((m) => m.brand?.name),
      ),
    [models],
  );

  const modelSelection = useTableSelection(filteredModels.map((model) => model.id));

  function submitBrand(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createBrandAction(formData);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Brand created");
      setBrandOpen(false);
      router.refresh();
    });
  }

  function submitModel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createModelAction(formData);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Model created");
      setModelOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <AppDataTable
        title="Brands"
        shellHeader={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TableSearchBar
              value={brandQuery}
              onChange={setBrandQuery}
              placeholder="Search brands…"
              suggestions={brandSuggestions}
              className="sm:max-w-sm"
            />
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <TableSelectionBadge
                count={brandSelection.selectedCount}
                onClear={brandSelection.clearSelection}
                size="sm"
              />
              <Button size="sm" onClick={() => setBrandOpen(true)}>
                <Plus className="size-4" /> Add brand
              </Button>
            </div>
          </div>
        }
        empty={brands.length === 0}
        emptyMessage="No brands yet."
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow>
                <TableSelectAllCheckbox
                  isAllSelected={brandSelection.isAllSelected}
                  isPartiallySelected={brandSelection.isPartiallySelected}
                  onToggleAll={brandSelection.toggleAll}
                  aria-label="Select all brands"
                />
                <TableIndexHead />
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Models</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBrands.length === 0 ? (
                <TableEmptyRow colSpan={5} message="No brands match your search." />
              ) : (
                filteredBrands.map((brand, index) => (
                  <TableRow
                    key={brand.id}
                    data-state={
                      brandSelection.isRowSelected(brand.id) ? "selected" : undefined
                    }
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableRowCheckbox
                      checked={brandSelection.isRowSelected(brand.id)}
                      onCheckedChange={(checked) =>
                        brandSelection.toggleRow(brand.id, checked)
                      }
                      aria-label={`Select brand ${brand.name}`}
                    />
                    <TableIndexCell index={index + 1} />
                    <TableCell className="font-medium">{brand.name}</TableCell>
                    <TableCell>{brand.code ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{brand._count.models}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </AppDataTableBody>
      </AppDataTable>

      <AppDataTable
        title="Models"
        shellHeader={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TableSearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search models…"
              suggestions={modelSuggestions}
              className="sm:max-w-sm"
            />
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <TableSelectionBadge
                count={modelSelection.selectedCount}
                onClear={modelSelection.clearSelection}
                size="sm"
              />
              <Button onClick={() => setModelOpen(true)}>
                <Plus className="size-4" /> Add model
              </Button>
            </div>
          </div>
        }
        empty={models.length === 0}
        emptyMessage="No product models yet."
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow>
                <TableSelectAllCheckbox
                  isAllSelected={modelSelection.isAllSelected}
                  isPartiallySelected={modelSelection.isPartiallySelected}
                  onToggleAll={modelSelection.toggleAll}
                  aria-label="Select all models"
                />
                <TableIndexHead />
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.length === 0 ? (
                <TableEmptyRow colSpan={6} message="No models match your search." />
              ) : (
                filteredModels.map((model, index) => (
                  <TableRow
                    key={model.id}
                    data-state={
                      modelSelection.isRowSelected(model.id) ? "selected" : undefined
                    }
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableRowCheckbox
                      checked={modelSelection.isRowSelected(model.id)}
                      onCheckedChange={(checked) =>
                        modelSelection.toggleRow(model.id, checked)
                      }
                      aria-label={`Select model ${model.skuCode}`}
                    />
                    <TableIndexCell index={index + 1} />
                    <TableCell className="font-mono text-sm">{model.skuCode}</TableCell>
                    <TableCell>{model.name}</TableCell>
                    <TableCell>{model.brand?.name ?? "—"}</TableCell>
                    <TableCell>
                      <TableStatusBadge status={model.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </AppDataTableBody>
      </AppDataTable>

      <Dialog open={brandOpen} onOpenChange={setBrandOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add brand</DialogTitle></DialogHeader>
          <form onSubmit={submitBrand} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="brand-name">Name</Label><Input id="brand-name" name="name" required /></div>
            <div className="space-y-2"><Label htmlFor="brand-code">Code</Label><Input id="brand-code" name="code" /></div>
            <DialogFooter><Button type="submit" disabled={pending}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={modelOpen} onOpenChange={setModelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add model</DialogTitle></DialogHeader>
          <form onSubmit={submitModel} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="skuCode">SKU code</Label><Input id="skuCode" name="skuCode" required /></div>
            <div className="space-y-2"><Label htmlFor="model-name">Name</Label><Input id="model-name" name="name" required /></div>
            <div className="space-y-2">
              <Label htmlFor="brandId">Brand</Label>
              <select id="brandId" name="brandId" className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                <option value="">None</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <DialogFooter><Button type="submit" disabled={pending}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
