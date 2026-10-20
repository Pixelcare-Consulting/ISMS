"use client";

import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  createDealerAction,
  deleteDealerAction,
  listDealerFormOptionsAction,
  updateDealerAction,
} from "@/features/dealers/actions/dealer.actions";
import { ImportDealersDialog } from "@/app/(app)/settings/dealers/_components/import-dealers-dialog";
import {
  DeleteConfirmDialog,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
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
import { matchesTableSearch } from "@/utils/match-table-search";

const dealerColumn = createColumnHelper<DataTableFeatures, DealerRow>();

interface DealerRow {
  id: string;
  name: string;
  sapCode: string | null;
  status: string;
  areaId: string | null;
  dealerTypeId: string | null;
  dealerAreaId: string | null;
  modeOfPaymentId: string | null;
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

export function DealersTable({ dealers }: { dealers: DealerRow[] }) {
  const router = useRouter();
  // Server data, rendered straight from props: this table never edits the list
  // locally, so copying it into state only risked showing a stale copy.
  const rows = dealers;
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<DealerRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DealerRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [name, setName] = useState("");
  const [sapCode, setSapCode] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [areaId, setAreaId] = useState("");
  const [dealerTypeId, setDealerTypeId] = useState("");
  const [dealerAreaId, setDealerAreaId] = useState("");
  const [modeOfPaymentId, setModeOfPaymentId] = useState("");

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

  const sort = useClientTableSort(filtered, {
    name: (row) => row.name,
    sapCode: (row) => row.sapCode,
    type: (row) => row.dealerType?.name,
    payment: (row) => row.modeOfPayment?.name,
    branches: (row) => row._count.branches,
    status: (row) => row.status,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query}:${sort.sortKey}:${sort.sortDir}`,
  });

  async function ensureOptions() {
    if (options) return options;
    const loaded = await listDealerFormOptionsAction();
    setOptions(loaded);
    return loaded;
  }

  function resetForm() {
    setEditing(null);
    setName("");
    setSapCode("");
    setStatus("active");
    setAreaId("");
    setDealerTypeId("");
    setDealerAreaId("");
    setModeOfPaymentId("");
  }

  function onFormOpenChange(open: boolean) {
    setFormOpen(open);
    if (open) void ensureOptions();
  }

  function openCreate() {
    resetForm();
    onFormOpenChange(true);
  }

  function openEdit(row: DealerRow) {
    setEditing(row);
    setName(row.name);
    setSapCode(row.sapCode ?? "");
    setStatus(row.status === "inactive" ? "inactive" : "active");
    setAreaId(row.areaId ?? "");
    setDealerTypeId(row.dealerTypeId ?? "");
    setDealerAreaId(row.dealerAreaId ?? "");
    setModeOfPaymentId(row.modeOfPaymentId ?? "");
    onFormOpenChange(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name: name.trim(),
      sapCode: sapCode.trim() || null,
      areaId: areaId || null,
      dealerTypeId: dealerTypeId || null,
      dealerAreaId: dealerAreaId || null,
      modeOfPaymentId: modeOfPaymentId || null,
      status,
    };
    startTransition(async () => {
      await ensureOptions();
      const result = editing
        ? await updateDealerAction({ dealerId: editing.id, ...payload })
        : await createDealerAction(payload);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success(editing ? "Dealer updated" : "Dealer created");
      onFormOpenChange(false);
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<DealerRow>[] = [
      dealerColumn.display({
        id: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => row.original.name,
      }),
      dealerColumn.display({
        id: "sapCode",
        header: "SAP",
        enableSorting: true,
        cell: ({ row }) => row.original.sapCode ?? "—",
      }),
      dealerColumn.display({
        id: "type",
        header: "Type",
        enableSorting: true,
        cell: ({ row }) => row.original.dealerType?.name ?? "—",
      }),
      dealerColumn.display({
        id: "payment",
        header: "Payment",
        enableSorting: true,
        cell: ({ row }) => row.original.modeOfPayment?.name ?? "—",
      }),
      dealerColumn.display({
        id: "branches",
        header: "Branches",
        enableSorting: true,
        cell: ({ row }) => row.original._count.branches,
      }),
      dealerColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <SearchableSelect
            className="min-w-[8rem]"
            options={[
              { id: "active", label: "Active" },
              { id: "inactive", label: "Inactive" },
            ]}
            value={row.original.status}
            disabled={pending}
            searchPlaceholder="Search status…"
            onChange={(next) => {
              startTransition(async () => {
                const result = await updateDealerAction({
                  dealerId: row.original.id,
                  name: row.original.name,
                  status: next as "active" | "inactive",
                });
                if (result.error) toast.error(String(result.error));
                else router.refresh();
              });
            }}
          />
        ),
      }),
      dealerColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions
            asCell={false}
            onEdit={() => openEdit(row.original)}
            onDelete={() => setDeleting(row.original)}
          />
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [pending, router]);

  return (
    <div className="space-y-4">
      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort.sortKey,
          sortDir: sort.sortDir,
          onSort: sort.toggleSort,
        }}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search dealers…",
          suggestions,
        }}
        toolbarActions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Upload className="mr-1 size-4" />
              Import
            </Button>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-3.5" />
              Add dealer
            </Button>
          </>
        }
        empty={pageItems.length === 0}
        emptyMessage={emptyMessage}
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "dealer",
          onPageChange: setPage,
        }}
      />

      <ImportDealersDialog open={importing} onOpenChange={setImporting} />

      <Sheet open={formOpen} onOpenChange={onFormOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>{editing ? "Edit dealer" : "Add dealer"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update the dealer name, SAP code, and classification lookups."
                : "Create a dealer with optional SAP code and classification lookups."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
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
              {editing ? (
                <SearchableSelect
                  label="Status"
                  id="dealer-status"
                  options={[
                    { id: "active", label: "Active" },
                    { id: "inactive", label: "Inactive" },
                  ]}
                  value={status}
                  onChange={(next) =>
                    setStatus(next === "inactive" ? "inactive" : "active")
                  }
                  searchPlaceholder="Search status…"
                  disabled={pending}
                />
              ) : null}
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => onFormOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {editing ? "Save changes" : "Add dealer"}
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
