"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createDealerAction,
  deleteDealerAction,
  listDealerFormOptionsAction,
  updateDealerAction,
} from "@/features/dealers/actions/dealer.actions";
import {
  DeleteConfirmDialog,
  TableEmptyRow,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
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
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

interface DealerRow {
  id: string;
  name: string;
  sapCode: string | null;
  status: string;
  area: { name: string } | null;
  dealerType: { name: string } | null;
  dealerArea: { name: string } | null;
  modeOfPayment: { name: string } | null;
  _count: { branches: number };
}

type Options = {
  areas: { id: string; name: string }[];
  dealerTypes: { id: string; name: string }[];
  dealerAreas: { id: string; name: string }[];
  modes: { id: string; name: string }[];
};

const COL_COUNT = 7;

export function DealersTable({ dealers }: { dealers: DealerRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(dealers);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<DealerRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [name, setName] = useState("");
  const [sapCode, setSapCode] = useState("");
  const [areaId, setAreaId] = useState("");
  const [dealerTypeId, setDealerTypeId] = useState("");
  const [dealerAreaId, setDealerAreaId] = useState("");
  const [modeOfPaymentId, setModeOfPaymentId] = useState("");

  useEffect(() => {
    setRows(dealers);
  }, [dealers]);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.name,
          row.sapCode ?? "",
          row.area?.name ?? "",
          row.dealerType?.name ?? "",
          row.modeOfPayment?.name ?? "",
        ]),
      ),
    [rows, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.name),
        rows.map((row) => row.sapCode),
        rows.map((row) => row.area?.name),
        rows.map((row) => row.dealerType?.name),
        rows.map((row) => row.modeOfPayment?.name),
      ),
    [rows],
  );

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
  } = useClientTablePagination(filtered, { resetKey: query });

  async function ensureOptions() {
    if (options) return options;
    const loaded = await listDealerFormOptionsAction();
    setOptions(loaded);
    return loaded;
  }

  function resetAddForm() {
    setName("");
    setSapCode("");
    setAreaId("");
    setDealerTypeId("");
    setDealerAreaId("");
    setModeOfPaymentId("");
  }

  function onAddOpenChange(open: boolean) {
    setAddOpen(open);
    if (open) {
      void ensureOptions();
    } else {
      resetAddForm();
    }
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      await ensureOptions();
      const result = await createDealerAction({
        name,
        sapCode: sapCode || null,
        areaId: areaId || null,
        dealerTypeId: dealerTypeId || null,
        dealerAreaId: dealerAreaId || null,
        modeOfPaymentId: modeOfPaymentId || null,
        status: "active",
      });
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Dealer created");
      onAddOpenChange(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteDealerAction(deleting.id);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Dealer deleted");
      setDeleting(null);
      router.refresh();
    });
  }

  const emptyMessage =
    rows.length === 0 ? "No dealers yet." : "No dealers match your search.";

  return (
    <div className="space-y-4">
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search dealers…",
          suggestions,
        }}
        toolbarActions={
          <Button type="button" size="sm" onClick={() => onAddOpenChange(true)}>
            <Plus className="size-3.5" />
            Add dealer
          </Button>
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "dealer",
          onPageChange: setPage,
        }}
      >
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <GlobalTableHead>Name</GlobalTableHead>
                <GlobalTableHead>SAP</GlobalTableHead>
                <GlobalTableHead>Type</GlobalTableHead>
                <GlobalTableHead>Payment</GlobalTableHead>
                <GlobalTableHead>Branches</GlobalTableHead>
                <GlobalTableHead>Status</GlobalTableHead>
                <GlobalTableHead className="w-28 text-right">Actions</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={COL_COUNT} message={emptyMessage} />
              ) : (
                pageItems.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.sapCode ?? "—"}</TableCell>
                    <TableCell>{row.dealerType?.name ?? "—"}</TableCell>
                    <TableCell>{row.modeOfPayment?.name ?? "—"}</TableCell>
                    <TableCell>{row._count.branches}</TableCell>
                    <TableCell>
                      <SearchableSelect
                        className="min-w-[8rem]"
                        options={[
                          { id: "active", label: "Active" },
                          { id: "inactive", label: "Inactive" },
                        ]}
                        value={row.status}
                        disabled={pending}
                        searchPlaceholder="Search status…"
                        onChange={(next) => {
                          startTransition(async () => {
                            const result = await updateDealerAction({
                              dealerId: row.id,
                              name: row.name,
                              status: next as "active" | "inactive",
                            });
                            if (result.error) toast.error(String(result.error));
                            else router.refresh();
                          });
                        }}
                      />
                    </TableCell>
                    <TableRowActions onDelete={() => setDeleting(row)} />
                  </TableRow>
                ))
              )}
            </TableBody>
      </GlobalDataTable>

      <Sheet open={addOpen} onOpenChange={onAddOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>Add dealer</SheetTitle>
            <SheetDescription>
              Create a dealer with optional SAP code and classification lookups.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="dealer-name">Name</Label>
                <Input
                  id="dealer-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dealer-sap">SAP code</Label>
                <Input
                  id="dealer-sap"
                  value={sapCode}
                  onChange={(e) => setSapCode(e.target.value)}
                />
              </div>
              <SearchableSelect
                label="Area"
                id="dealer-area"
                options={(options?.areas ?? []).map((a) => ({
                  id: a.id,
                  label: a.name,
                }))}
                value={areaId}
                onChange={setAreaId}
                allowClear
                placeholder="—"
                searchPlaceholder="Search areas…"
                disabled={pending}
              />
              <SearchableSelect
                label="Dealer type"
                id="dealer-type"
                options={(options?.dealerTypes ?? []).map((a) => ({
                  id: a.id,
                  label: a.name,
                }))}
                value={dealerTypeId}
                onChange={setDealerTypeId}
                allowClear
                placeholder="—"
                searchPlaceholder="Search dealer types…"
                disabled={pending}
              />
              <SearchableSelect
                label="Dealer area"
                id="dealer-dealer-area"
                options={(options?.dealerAreas ?? []).map((a) => ({
                  id: a.id,
                  label: a.name,
                }))}
                value={dealerAreaId}
                onChange={setDealerAreaId}
                allowClear
                placeholder="—"
                searchPlaceholder="Search dealer areas…"
                disabled={pending}
              />
              <SearchableSelect
                label="Mode of payment"
                id="dealer-payment"
                options={(options?.modes ?? []).map((a) => ({
                  id: a.id,
                  label: a.name,
                }))}
                value={modeOfPaymentId}
                onChange={setModeOfPaymentId}
                allowClear
                placeholder="—"
                searchPlaceholder="Search payment modes…"
                disabled={pending}
              />
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => onAddOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name}>
                Add dealer
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete dealer?"
        description={deleting ? `Remove ${deleting.name}?` : "Remove this dealer?"}
        onConfirm={handleDelete}
        pending={pending}
      />
    </div>
  );
}
