"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createBrandAction,
  createCategoryAction,
} from "@/features/master-data/actions/master-data.actions";
import { AppDataTable, AppDataTableBody, DataTableEmpty } from "@/components/data-table";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

interface MasterDataBrandsPanelProps {
  brands: { id: string; code: string | null; name: string }[];
  categories: { id: string; name: string }[];
}

export function MasterDataBrandsPanel({ brands, categories }: MasterDataBrandsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [brandCode, setBrandCode] = useState("");
  const [brandName, setBrandName] = useState("");
  const [catCode, setCatCode] = useState("");
  const [catName, setCatName] = useState("");
  const brandSelection = useTableSelection(brands.map((brand) => brand.id));
  const categorySelection = useTableSelection(categories.map((category) => category.id));

  function addBrand() {
    startTransition(async () => {
      const result = await createBrandAction({ name: brandName, code: brandCode || undefined });
      if (result.error) {
        toast.error("Could not add brand");
        return;
      }
      toast.success("Brand added");
      setBrandCode("");
      setBrandName("");
      router.refresh();
    });
  }

  function addCategory() {
    startTransition(async () => {
      const result = await createCategoryAction({ name: catName });
      if (result.error) {
        toast.error("Could not add category");
        return;
      }
      toast.success("Category added");
      setCatCode("");
      setCatName("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4 shadow-sm">
          <div>
            <Label>Code</Label>
            <Input value={brandCode} onChange={(e) => setBrandCode(e.target.value)} />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </div>
          <Button className="self-end" disabled={pending} onClick={addBrand}>
            Add brand
          </Button>
        </div>
        {brands.length === 0 ? (
          <DataTableEmpty message="No brands yet." />
        ) : (
          <AppDataTable title="Brands">
            <AppDataTableBody>
              {brandSelection.selectedCount > 0 ? (
                <div className="px-4 pb-2">
                  <Button variant="secondary" size="sm" onClick={brandSelection.clearSelection}>
                    {brandSelection.selectedCount} selected
                  </Button>
                </div>
              ) : null}
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
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((b, index) => (
                    <TableRow key={b.id} data-state={brandSelection.isRowSelected(b.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={brandSelection.isRowSelected(b.id)}
                          onCheckedChange={(checked) => brandSelection.toggleRow(b.id, checked === true)}
                          aria-label={`Select brand ${b.name}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{b.code ?? "—"}</TableCell>
                      <TableCell className="font-medium">{b.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AppDataTableBody>
          </AppDataTable>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4 shadow-sm">
          <div>
            <Label>Code</Label>
            <Input value={catCode} onChange={(e) => setCatCode(e.target.value)} />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} />
          </div>
          <Button className="self-end" disabled={pending} onClick={addCategory}>
            Add category
          </Button>
        </div>
        {categories.length === 0 ? (
          <DataTableEmpty message="No categories yet." />
        ) : (
          <AppDataTable title="Categories">
            <AppDataTableBody>
              {categorySelection.selectedCount > 0 ? (
                <div className="px-4 pb-2">
                  <Button variant="secondary" size="sm" onClick={categorySelection.clearSelection}>
                    {categorySelection.selectedCount} selected
                  </Button>
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={categorySelection.isAllSelected || (categorySelection.isPartiallySelected ? "indeterminate" : false)}
                        onCheckedChange={(checked) => categorySelection.toggleAll(checked === true)}
                        aria-label="Select all categories"
                      />
                    </TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c, index) => (
                    <TableRow key={c.id} data-state={categorySelection.isRowSelected(c.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={categorySelection.isRowSelected(c.id)}
                          onCheckedChange={(checked) => categorySelection.toggleRow(c.id, checked === true)}
                          aria-label={`Select category ${c.name}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AppDataTableBody>
          </AppDataTable>
        )}
      </div>
    </div>
  );
}
