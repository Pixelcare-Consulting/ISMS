"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  const [brandRows, setBrandRows] = useState(brands);
  const [categoryRows, setCategoryRows] = useState(categories);
  const [pending, startTransition] = useTransition();
  const [brandOpen, setBrandOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [brandCode, setBrandCode] = useState("");
  const [brandName, setBrandName] = useState("");
  const [catName, setCatName] = useState("");
  const brandSelection = useTableSelection(brands.map((brand) => brand.id));
  const categorySelection = useTableSelection(categories.map((category) => category.id));

  useEffect(() => {
    setBrandRows(brands);
  }, [brands]);

  useEffect(() => {
    setCategoryRows(categories);
  }, [categories]);

  function resetBrandForm() {
    setBrandCode("");
    setBrandName("");
  }

  function resetCategoryForm() {
    setCatName("");
  }

  function onBrandOpenChange(open: boolean) {
    setBrandOpen(open);
    if (!open) resetBrandForm();
  }

  function onCategoryOpenChange(open: boolean) {
    setCategoryOpen(open);
    if (!open) resetCategoryForm();
  }

  function handleAddBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createBrandAction({ name: brandName, code: brandCode || undefined });
      if (result.error) {
        toast.error("Could not add brand");
        return;
      }
      toast.success("Brand added");
      if (result.brand) {
        setBrandRows((currentRows) => [result.brand, ...currentRows]);
      }
      onBrandOpenChange(false);
      router.refresh();
    });
  }

  function handleAddCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createCategoryAction({ name: catName });
      if (result.error) {
        toast.error("Could not add category");
        return;
      }
      toast.success("Category added");
      if (result.category) {
        setCategoryRows((currentRows) => [result.category, ...currentRows]);
      }
      onCategoryOpenChange(false);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {brandRows.length === 0 ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => onBrandOpenChange(true)}>
                <Plus className="size-3.5" />
                Add brand
              </Button>
            </div>
            <DataTableEmpty message="No brands yet." />
          </div>
        ) : (
          <AppDataTable
            title="Brands"
            shellHeader={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {brandSelection.selectedCount > 0 ? (
                    <Button variant="secondary" size="sm" onClick={brandSelection.clearSelection}>
                      {brandSelection.selectedCount} selected
                    </Button>
                  ) : null}
                </div>
                <Button type="button" size="sm" onClick={() => onBrandOpenChange(true)}>
                  <Plus className="size-3.5" />
                  Add brand
                </Button>
              </div>
            }
          >
            <AppDataTableBody>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          brandSelection.isAllSelected ||
                          (brandSelection.isPartiallySelected ? "indeterminate" : false)
                        }
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
                  {brandRows.map((b, index) => (
                    <TableRow
                      key={b.id}
                      data-state={brandSelection.isRowSelected(b.id) ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={brandSelection.isRowSelected(b.id)}
                          onCheckedChange={(checked) =>
                            brandSelection.toggleRow(b.id, checked === true)
                          }
                          aria-label={`Select brand ${b.name}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {index + 1}
                      </TableCell>
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
        {categoryRows.length === 0 ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => onCategoryOpenChange(true)}>
                <Plus className="size-3.5" />
                Add category
              </Button>
            </div>
            <DataTableEmpty message="No categories yet." />
          </div>
        ) : (
          <AppDataTable
            title="Categories"
            shellHeader={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {categorySelection.selectedCount > 0 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={categorySelection.clearSelection}
                    >
                      {categorySelection.selectedCount} selected
                    </Button>
                  ) : null}
                </div>
                <Button type="button" size="sm" onClick={() => onCategoryOpenChange(true)}>
                  <Plus className="size-3.5" />
                  Add category
                </Button>
              </div>
            }
          >
            <AppDataTableBody>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          categorySelection.isAllSelected ||
                          (categorySelection.isPartiallySelected ? "indeterminate" : false)
                        }
                        onCheckedChange={(checked) =>
                          categorySelection.toggleAll(checked === true)
                        }
                        aria-label="Select all categories"
                      />
                    </TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryRows.map((c, index) => (
                    <TableRow
                      key={c.id}
                      data-state={categorySelection.isRowSelected(c.id) ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={categorySelection.isRowSelected(c.id)}
                          onCheckedChange={(checked) =>
                            categorySelection.toggleRow(c.id, checked === true)
                          }
                          aria-label={`Select category ${c.name}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AppDataTableBody>
          </AppDataTable>
        )}
      </div>

      <Sheet open={brandOpen} onOpenChange={onBrandOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>Add brand</SheetTitle>
            <SheetDescription>Create a brand with optional code and display name.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddBrand} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="brand-code">Code</Label>
                <Input
                  id="brand-code"
                  value={brandCode}
                  onChange={(e) => setBrandCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-name">Name</Label>
                <Input
                  id="brand-name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  required
                />
              </div>
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button type="button" variant="outline" onClick={() => onBrandOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !brandName}>
                Add brand
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={categoryOpen} onOpenChange={onCategoryOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>Add category</SheetTitle>
            <SheetDescription>Create a product category.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddCategory} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Name</Label>
                <Input
                  id="category-name"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  required
                />
              </div>
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => onCategoryOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !catName}>
                Add category
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
