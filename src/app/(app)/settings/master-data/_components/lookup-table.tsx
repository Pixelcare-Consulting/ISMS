"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createLookupAction,
  setLookupStatusAction,
  updateLookupAction,
} from "@/features/lookups/actions/lookup.actions";
import {
  LOOKUP_ENTITIES,
  type LookupEntityKey,
} from "@/features/lookups/constants/lookup-registry";
import { Button } from "@/components/ui/button";
import {
  TableRowActions,
  TableStatusBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { matchesTableSearch } from "@/utils/match-table-search";

const lookupColumn = createColumnHelper<DataTableFeatures, LookupRowData>();
import type { LookupRecordStatus } from "@prisma/client";

export interface LookupRowData {
  id: string;
  name: string;
  recordStatus: LookupRecordStatus;
  code?: string | null;
  class?: string | null;
  quantity?: number | null;
  brandId?: string | null;
  regionId?: string | null;
  sizeId?: string | null;
  documentTypeId?: string | null;
  competitorBrandId?: string | null;
  brand?: { name: string } | null;
  region?: { name: string } | null;
  size?: { name: string } | null;
  documentType?: { name: string } | null;
  competitorBrand?: { name: string } | null;
}

export interface LookupOption {
  id: string;
  name: string;
}

interface LookupTableProps {
  entity: LookupEntityKey;
  rows: LookupRowData[];
  parentOptions?: LookupOption[];
  childRows?: LookupRowData[];
}

export function LookupTable({ entity, rows, parentOptions, childRows }: LookupTableProps) {
  const config = LOOKUP_ENTITIES[entity];
  const childConfig = config.child ? LOOKUP_ENTITIES[config.child] : null;
  const childParentOptions = useMemo(
    () =>
      rows
        .filter((row) => row.recordStatus === "active")
        .map((row) => ({ id: row.id, name: row.name })),
    [rows],
  );

  if (childConfig && childRows) {
    return (
      <div className="space-y-6">
        <LookupSection entity={entity} rows={rows} parentOptions={parentOptions} title={config.label} />
        <LookupSection
          entity={childConfig.key}
          rows={childRows}
          parentOptions={childParentOptions}
          title={childConfig.label}
        />
      </div>
    );
  }

  return <LookupSection entity={entity} rows={rows} parentOptions={parentOptions} />;
}

interface LookupSectionProps {
  entity: LookupEntityKey;
  rows: LookupRowData[];
  parentOptions?: LookupOption[];
  title?: string;
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function LookupSection({ entity, rows, parentOptions, title }: LookupSectionProps) {
  const config = LOOKUP_ENTITIES[entity];
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LookupRowData | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formParentId, setFormParentId] = useState("");
  const [formClass, setFormClass] = useState("");
  const [formQuantity, setFormQuantity] = useState("1");
  const [pending, startTransition] = useTransition();

  const parentNamesById = useMemo(
    () => new Map((parentOptions ?? []).map((option) => [option.id, option.name])),
    [parentOptions],
  );

  const parentNameOf = useCallback(
    (row: LookupRowData) => {
      if (!config.parent) return null;
      const related = row[config.parent.relation];
      if (related?.name) return related.name;
      const parentId = row[config.parent.field];
      return parentId ? parentNamesById.get(parentId) ?? null : null;
    },
    [config.parent, parentNamesById],
  );

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.name,
          row.code ?? "",
          row.class ?? "",
          parentNameOf(row) ?? "",
        ]),
      ),
    [rows, query, parentNameOf],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.name),
        rows.map((row) => row.code),
        rows.map((row) => row.class),
        rows.map((row) => parentNameOf(row)),
      ),
    [rows, parentNameOf],
  );

  const sort = useClientTableSort(filtered, {
    name: (row) => row.name,
    code: (row) => row.code,
    class: (row) => row.class,
    quantity: (row) => row.quantity,
    parent: (row) => parentNameOf(row),
    status: (row) => row.recordStatus,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query}:${sort.sortKey}:${sort.sortDir}`,
  });

  function openCreate() {
    setEditing(null);
    setFormName("");
    setFormCode("");
    setFormParentId("");
    setFormClass("");
    setFormQuantity("1");
    setOpen(true);
  }

  function openEdit(row: LookupRowData) {
    setEditing(row);
    setFormName(row.name);
    setFormCode(row.code ?? "");
    setFormParentId(config.parent ? row[config.parent.field] ?? "" : "");
    setFormClass(row.class ?? "");
    setFormQuantity(String(row.quantity ?? 1));
    setOpen(true);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name: formName,
      ...(config.code ? { code: formCode || undefined } : {}),
      ...(config.parent ? { parentId: formParentId || undefined } : {}),
      ...(config.classField ? { class: formClass || undefined } : {}),
      ...(config.quantityField
        ? { quantity: Number(formQuantity) || 1 }
        : {}),
    };
    startTransition(async () => {
      const result = editing
        ? await updateLookupAction(entity, editing.id, payload)
        : await createLookupAction(entity, payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        editing
          ? `${sentenceCase(config.singular)} updated`
          : `${sentenceCase(config.singular)} created`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  function toggleStatus(row: LookupRowData) {
    const next: LookupRecordStatus = row.recordStatus === "active" ? "inactive" : "active";
    startTransition(async () => {
      const result = await setLookupStatusAction(entity, row.id, { recordStatus: next });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next === "active"
          ? `${sentenceCase(config.singular)} activated`
          : `${sentenceCase(config.singular)} deactivated`,
      );
      router.refresh();
    });
  }

  const addDisabled = Boolean(
    config.parent?.required && (parentOptions?.length ?? 0) === 0,
  );

  const columns = useMemo(() => {
    const cols: DataTableColumn<LookupRowData>[] = [
      lookupColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      lookupColumn.display({
        id: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => row.original.name,
        meta: { className: "font-medium" },
      }),
    ];
    if (config.code) {
      cols.push(
        lookupColumn.display({
          id: "code",
          header: "Code",
          enableSorting: true,
          cell: ({ row }) => row.original.code ?? "—",
          meta: { className: "font-mono text-sm" },
        }),
      );
    }
    if (config.classField) {
      cols.push(
        lookupColumn.display({
          id: "class",
          header: "Class",
          enableSorting: true,
          cell: ({ row }) => row.original.class ?? "—",
        }),
      );
    }
    if (config.quantityField) {
      cols.push(
        lookupColumn.display({
          id: "quantity",
          header: "Qty",
          enableSorting: true,
          cell: ({ row }) => row.original.quantity ?? 1,
          meta: { className: "tabular-nums" },
        }),
      );
    }
    if (config.parent) {
      cols.push(
        lookupColumn.display({
          id: "parent",
          header: config.parent.label,
          enableSorting: true,
          cell: ({ row }) => parentNameOf(row.original) ?? "—",
        }),
      );
    }
    cols.push(
      lookupColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <TableStatusBadge
            status={row.original.recordStatus}
            label={row.original.recordStatus === "active" ? "Active" : "Inactive"}
          />
        ),
      }),
      lookupColumn.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions asCell={false} onEdit={() => openEdit(row.original)} editDisabled={pending}>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => toggleStatus(row.original)}
            >
              {row.original.recordStatus === "active" ? "Deactivate" : "Activate"}
            </Button>
          </TableRowActions>
        ),
        meta: { align: "end" },
      }),
    );
    return cols;
  }, [config, indexOffset, parentNameOf, pending]);

  return (
    <>
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
        toolbarLeading={title ? <span className="text-sm font-medium">{title}</span> : null}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: `Search ${config.label.toLowerCase()}…`,
          suggestions,
        }}
        toolbarActions={
          <Button onClick={openCreate} disabled={addDisabled}>
            <Plus className="size-4" /> Add {config.singular}
          </Button>
        }
        empty={pageItems.length === 0}
        emptyMessage={
          rows.length === 0
            ? `No ${config.label.toLowerCase()} yet.`
            : "No results match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: config.singular,
          onPageChange: setPage,
        }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Edit ${config.singular}`
                : `Add ${config.singular}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Update this ${config.singular} record.`
                : `Create a new ${config.singular} record.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${entity}-name`}>Name</Label>
              <Input
                id={`${entity}-name`}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            {config.code ? (
              <div className="space-y-2">
                <Label htmlFor={`${entity}-code`}>Code</Label>
                <Input
                  id={`${entity}-code`}
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  required={config.code.required}
                />
              </div>
            ) : null}
            {config.classField ? (
              <div className="space-y-2">
                <Label htmlFor={`${entity}-class`}>Class</Label>
                <Input
                  id={`${entity}-class`}
                  value={formClass}
                  onChange={(e) => setFormClass(e.target.value)}
                />
              </div>
            ) : null}
            {config.quantityField ? (
              <div className="space-y-2">
                <Label htmlFor={`${entity}-quantity`}>Quantity</Label>
                <Input
                  id={`${entity}-quantity`}
                  type="number"
                  min={1}
                  step={1}
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                  required
                />
              </div>
            ) : null}
            {config.parent ? (
              <SearchableSelect
                label={config.parent.label}
                id={`${entity}-parent`}
                options={(parentOptions ?? []).map((option) => ({
                  id: option.id,
                  label: option.name,
                }))}
                value={formParentId}
                onChange={setFormParentId}
                allowClear={!config.parent.required}
                placeholder={
                  config.parent.required
                    ? `Select ${config.parent.label.toLowerCase()}…`
                    : "None"
                }
                searchPlaceholder={`Search ${config.parent.label.toLowerCase()}…`}
                disabled={pending}
              />
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {editing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
