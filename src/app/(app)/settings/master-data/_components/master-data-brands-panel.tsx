"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createBrandAction } from "@/features/master-data/actions/master-data.actions";
import { DataTableEmpty } from "@/components/data-table";
import { useClientTablePagination } from "@/components/data-table/use-client-table-pagination";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
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
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MasterDataBrandsPanelProps {
  brands: { id: string; code: string | null; name: string }[];
}

export function MasterDataBrandsPanel({ brands }: MasterDataBrandsPanelProps) {
  const router = useRouter();
  /**
   * Local copy so a newly created brand appears at once, re-seeded whenever the server
   * sends a new list. Adjusted during render rather than in an effect, which would
   * paint the stale list for a frame first.
   */
  const [brandRows, setBrandRows] = useState(brands);
  const [seededBrands, setSeededBrands] = useState(brands);
  if (seededBrands !== brands) {
    setSeededBrands(brands);
    setBrandRows(brands);
  }
  const [pending, startTransition] = useTransition();
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandCode, setBrandCode] = useState("");
  const [brandName, setBrandName] = useState("");
  const brandSelection = useTableSelection(brands.map((brand) => brand.id));
  const brandSort = useClientTableSort(brandRows, {
    code: (b) => b.code,
    name: (b) => b.name,
  });
  const {
    page: brandPage,
    setPage: setBrandPage,
    pageSize: brandPageSize,
    setPageSize: setBrandPageSize,
    total: brandTotal,
    totalPages: brandTotalPages,
    pageItems: brandPageItems,
    indexOffset: brandIndexOffset,
  } = useClientTablePagination(brandSort.sorted, {
    resetKey: `${brandSort.sortKey}:${brandSort.sortDir}`,
  });

  function resetBrandForm() {
    setBrandCode("");
    setBrandName("");
  }

  function onBrandOpenChange(open: boolean) {
    setBrandOpen(open);
    if (!open) resetBrandForm();
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

  return (
    <div className="grid gap-6">
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
          <GlobalDataTable
            stickyHeader
            toolbarLeading={<span className="text-sm font-medium">Brands</span>}
            toolbarActions={
              <>
                {brandSelection.selectedCount > 0 ? (
                  <Button variant="secondary" size="sm" onClick={brandSelection.clearSelection}>
                    {brandSelection.selectedCount} selected
                  </Button>
                ) : null}
                <Button type="button" size="sm" onClick={() => onBrandOpenChange(true)}>
                  <Plus className="size-3.5" />
                  Add brand
                </Button>
              </>
            }
            pagination={{
              total: brandTotal,
              page: brandPage,
              totalPages: brandTotalPages,
              itemLabel: "brand",
              onPageChange: setBrandPage,
            }}
            pageSize={{ value: brandPageSize, onChange: setBrandPageSize }}
          >
                <TableHeader>
                  <TableRow>
                    <GlobalTableHead className="w-10">
                      <Checkbox
                        checked={
                          brandSelection.isAllSelected ||
                          (brandSelection.isPartiallySelected ? "indeterminate" : false)
                        }
                        onCheckedChange={(checked) => brandSelection.toggleAll(checked === true)}
                        aria-label="Select all brands"
                      />
                    </GlobalTableHead>
                    <GlobalTableHead className="w-12">#</GlobalTableHead>
                    <GlobalTableHead {...brandSort.sortProps("code")}>Code</GlobalTableHead>
                    <GlobalTableHead {...brandSort.sortProps("name")}>Name</GlobalTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brandPageItems.map((b, index) => (
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
                        {brandIndexOffset + index + 1}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{b.code ?? "—"}</TableCell>
                      <TableCell className="font-medium">{b.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
          </GlobalDataTable>
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
    </div>
  );
}
