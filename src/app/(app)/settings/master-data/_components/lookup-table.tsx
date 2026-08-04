"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
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
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableStatusBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
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
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";
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

  const colSpan =
    3 +
    (config.code ? 1 : 0) +
    (config.classField ? 1 : 0) +
    (config.quantityField ? 1 : 0) +
    (config.parent ? 1 : 0);

  return (
    <>
      <GlobalDataTable
        stickyHeader
        toolbarLeading={
          title ? <span className="text-sm font-medium">{title}</span> : null
        }
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
        empty={rows.length === 0}
        emptyMessage={`No ${config.label.toLowerCase()} yet.`}
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: config.singular,
          onPageChange: setPage,
        }}
      >
            <TableHeader>
              <TableRow>
                <TableIndexHead />
                <GlobalTableHead {...sort.sortProps("name")}>Name</GlobalTableHead>
                {config.code ? (
                  <GlobalTableHead {...sort.sortProps("code")}>Code</GlobalTableHead>
                ) : null}
                {config.classField ? (
                  <GlobalTableHead {...sort.sortProps("class")}>Class</GlobalTableHead>
                ) : null}
                {config.quantityField ? (
                  <GlobalTableHead {...sort.sortProps("quantity")}>Qty</GlobalTableHead>
                ) : null}
                {config.parent ? (
                  <GlobalTableHead {...sort.sortProps("parent")}>
                    {config.parent.label}
                  </GlobalTableHead>
                ) : null}
                <GlobalTableHead {...sort.sortProps("status")}>Status</GlobalTableHead>
                <GlobalTableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={colSpan} message="No results match your search." />
              ) : (
                pageItems.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableIndexCell index={indexOffset + index + 1} />
                    <TableCell className="font-medium">{row.name}</TableCell>
                    {config.code ? (
                      <TableCell className="font-mono text-sm">{row.code ?? "—"}</TableCell>
                    ) : null}
                    {config.classField ? (
                      <TableCell>{row.class ?? "—"}</TableCell>
                    ) : null}
                    {config.quantityField ? (
                      <TableCell className="tabular-nums">{row.quantity ?? 1}</TableCell>
                    ) : null}
                    {config.parent ? (
                      <TableCell>{parentNameOf(row) ?? "—"}</TableCell>
                    ) : null}
                    <TableCell>
                      <TableStatusBadge
                        status={row.recordStatus}
                        label={row.recordStatus === "active" ? "Active" : "Inactive"}
                      />
                    </TableCell>
                    <TableRowActions onEdit={() => openEdit(row)} editDisabled={pending}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => toggleStatus(row)}
                      >
                        {row.recordStatus === "active" ? "Deactivate" : "Activate"}
                      </Button>
                    </TableRowActions>
                  </TableRow>
                ))
              )}
            </TableBody>
      </GlobalDataTable>

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
