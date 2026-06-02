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
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [query, setQuery] = useState("");
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const brandSelection = useTableSelection(brands.map((brand) => brand.id));

  const filteredModels = useMemo(
    () =>
      models.filter((m) =>
        matchesTableSearch(query, [m.skuCode, m.name, m.brand?.name ?? ""]),
      ),
    [models, query],
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
      <DataTableShell>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-medium">Brands</h3>
          <Button size="sm" onClick={() => setBrandOpen(true)}>
            <Plus className="size-4" /> Add brand
          </Button>
        </div>
        {brandSelection.selectedCount > 0 ? (
          <div className="px-4 pb-2">
            <Button variant="secondary" size="sm" onClick={brandSelection.clearSelection}>
              {brandSelection.selectedCount} selected
            </Button>
          </div>
        ) : null}
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={brandSelection.isAllSelected || (brandSelection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => brandSelection.toggleAll(checked === true)}
                    aria-label="Select all brands"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Models</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((brand, index) => (
                <TableRow key={brand.id} data-state={brandSelection.isRowSelected(brand.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={brandSelection.isRowSelected(brand.id)}
                      onCheckedChange={(checked) => brandSelection.toggleRow(brand.id, checked === true)}
                      aria-label={`Select brand ${brand.name}`}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{brand.name}</TableCell>
                  <TableCell>{brand.code ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{brand._count.models}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>

      <DataTableShell>
        <TableSearchToolbar value={query} onChange={setQuery} placeholder="Search models…">
          {modelSelection.selectedCount > 0 ? (
            <Button variant="secondary" size="sm" onClick={modelSelection.clearSelection}>
              {modelSelection.selectedCount} selected
            </Button>
          ) : null}
          <Button onClick={() => setModelOpen(true)}>
            <Plus className="size-4" /> Add model
          </Button>
        </TableSearchToolbar>
        {models.length === 0 ? (
          <DataTableEmpty message="No product models yet." />
        ) : (
          <DataTableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={modelSelection.isAllSelected || (modelSelection.isPartiallySelected ? "indeterminate" : false)}
                      onCheckedChange={(checked) => modelSelection.toggleAll(checked === true)}
                      aria-label="Select all models"
                    />
                  </TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels.map((model, index) => (
                  <TableRow key={model.id} data-state={modelSelection.isRowSelected(model.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={modelSelection.isRowSelected(model.id)}
                        onCheckedChange={(checked) => modelSelection.toggleRow(model.id, checked === true)}
                        aria-label={`Select model ${model.skuCode}`}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-mono text-sm">{model.skuCode}</TableCell>
                    <TableCell>{model.name}</TableCell>
                    <TableCell>{model.brand?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{model.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableScroll>
        )}
      </DataTableShell>

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
