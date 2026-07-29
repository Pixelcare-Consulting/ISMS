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
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  TableStatusBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TableBody,
  TableCell,
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
  const [modelBrandId, setModelBrandId] = useState("");
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
  const {
    page: brandPage,
    setPage: setBrandPage,
    total: brandTotal,
    totalPages: brandTotalPages,
    pageItems: brandPageItems,
    indexOffset: brandIndexOffset,
  } = useClientTablePagination(filteredBrands, {
    pageSize: 10,
    resetKey: brandQuery,
  });

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
  const {
    page: modelPage,
    setPage: setModelPage,
    total: modelTotal,
    totalPages: modelTotalPages,
    pageItems: modelPageItems,
    indexOffset: modelIndexOffset,
  } = useClientTablePagination(filteredModels, {
    pageSize: 10,
    resetKey: query,
  });

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
      <GlobalDataTable
        stickyHeader
        toolbarLeading={<span className="text-sm font-medium">Brands</span>}
        search={{
          value: brandQuery,
          onChange: setBrandQuery,
          placeholder: "Search brands…",
          suggestions: brandSuggestions,
        }}
        toolbarActions={
          <>
            <TableSelectionBadge
              count={brandSelection.selectedCount}
              onClear={brandSelection.clearSelection}
              size="sm"
            />
            <Button size="sm" onClick={() => setBrandOpen(true)}>
              <Plus className="size-4" /> Add brand
            </Button>
          </>
        }
        empty={brands.length === 0}
        emptyMessage="No brands yet."
        pagination={{
          total: brandTotal,
          page: brandPage,
          totalPages: brandTotalPages,
          itemLabel: "brand",
          onPageChange: setBrandPage,
        }}
      >
            <TableHeader>
              <TableRow>
                <TableSelectAllCheckbox
                  isAllSelected={brandSelection.isAllSelected}
                  isPartiallySelected={brandSelection.isPartiallySelected}
                  onToggleAll={brandSelection.toggleAll}
                  aria-label="Select all brands"
                />
                <TableIndexHead />
                <GlobalTableHead>Name</GlobalTableHead>
                <GlobalTableHead>Code</GlobalTableHead>
                <GlobalTableHead className="text-right">Models</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBrands.length === 0 ? (
                <TableEmptyRow colSpan={5} message="No brands match your search." />
              ) : (
                brandPageItems.map((brand, index) => (
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
                    <TableIndexCell index={brandIndexOffset + index + 1} />
                    <TableCell className="font-medium">{brand.name}</TableCell>
                    <TableCell>{brand.code ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{brand._count.models}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
      </GlobalDataTable>

      <GlobalDataTable
        stickyHeader
        toolbarLeading={<span className="text-sm font-medium">Models</span>}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search models…",
          suggestions: modelSuggestions,
        }}
        toolbarActions={
          <>
            <TableSelectionBadge
              count={modelSelection.selectedCount}
              onClear={modelSelection.clearSelection}
              size="sm"
            />
            <Button onClick={() => setModelOpen(true)}>
              <Plus className="size-4" /> Add model
            </Button>
          </>
        }
        empty={models.length === 0}
        emptyMessage="No product models yet."
        pagination={{
          total: modelTotal,
          page: modelPage,
          totalPages: modelTotalPages,
          itemLabel: "model",
          onPageChange: setModelPage,
        }}
      >
            <TableHeader>
              <TableRow>
                <TableSelectAllCheckbox
                  isAllSelected={modelSelection.isAllSelected}
                  isPartiallySelected={modelSelection.isPartiallySelected}
                  onToggleAll={modelSelection.toggleAll}
                  aria-label="Select all models"
                />
                <TableIndexHead />
                <GlobalTableHead>SKU</GlobalTableHead>
                <GlobalTableHead>Name</GlobalTableHead>
                <GlobalTableHead>Brand</GlobalTableHead>
                <GlobalTableHead>Status</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.length === 0 ? (
                <TableEmptyRow colSpan={6} message="No models match your search." />
              ) : (
                modelPageItems.map((model, index) => (
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
                    <TableIndexCell index={modelIndexOffset + index + 1} />
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
      </GlobalDataTable>

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

      <Dialog
        open={modelOpen}
        onOpenChange={(next) => {
          setModelOpen(next);
          if (!next) setModelBrandId("");
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Add model</DialogTitle></DialogHeader>
          <form onSubmit={submitModel} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="skuCode">SKU code</Label><Input id="skuCode" name="skuCode" required /></div>
            <div className="space-y-2"><Label htmlFor="model-name">Name</Label><Input id="model-name" name="name" required /></div>
            <SearchableSelect
              label="Brand"
              id="brandId"
              name="brandId"
              options={brands.map((b) => ({ id: b.id, label: b.name }))}
              value={modelBrandId}
              onChange={setModelBrandId}
              allowClear
              placeholder="None"
              searchPlaceholder="Search brands…"
              disabled={pending}
            />
            <DialogFooter><Button type="submit" disabled={pending}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
