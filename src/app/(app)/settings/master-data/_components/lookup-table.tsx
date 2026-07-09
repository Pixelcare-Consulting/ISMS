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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
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
import type { LookupRecordStatus } from "@prisma/client";

export interface LookupRowData {
  id: string;
  name: string;
  recordStatus: LookupRecordStatus;
  code?: string | null;
  class?: string | null;
  brandId?: string | null;
  regionId?: string | null;
  sizeId?: string | null;
  documentTypeId?: string | null;
  brand?: { name: string } | null;
  region?: { name: string } | null;
  size?: { name: string } | null;
  documentType?: { name: string } | null;
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

  function openCreate() {
    setEditing(null);
    setFormName("");
    setFormCode("");
    setFormParentId("");
    setFormClass("");
    setOpen(true);
  }

  function openEdit(row: LookupRowData) {
    setEditing(row);
    setFormName(row.name);
    setFormCode(row.code ?? "");
    setFormParentId(config.parent ? row[config.parent.field] ?? "" : "");
    setFormClass(row.class ?? "");
    setOpen(true);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name: formName,
      ...(config.code ? { code: formCode || undefined } : {}),
      ...(config.parent ? { parentId: formParentId || undefined } : {}),
      ...(config.classField ? { class: formClass || undefined } : {}),
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

  return (
    <DataTableShell>
      {title ? (
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">{title}</h3>
        </div>
      ) : null}
      <TableSearchToolbar
        value={query}
        onChange={setQuery}
        placeholder={`Search ${config.label.toLowerCase()}…`}
      >
        <Button onClick={openCreate} disabled={addDisabled}>
          <Plus className="size-4" /> Add {config.singular}
        </Button>
      </TableSearchToolbar>
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {rows.length === 0
            ? `No ${config.label.toLowerCase()} yet.`
            : "No results match your search."}
        </div>
      ) : (
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                {config.code ? <TableHead>Code</TableHead> : null}
                {config.classField ? <TableHead>Class</TableHead> : null}
                {config.parent ? <TableHead>{config.parent.label}</TableHead> : null}
                <TableHead>Status</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  {config.code ? (
                    <TableCell className="font-mono text-sm">{row.code ?? "—"}</TableCell>
                  ) : null}
                  {config.classField ? (
                    <TableCell>{row.class ?? "—"}</TableCell>
                  ) : null}
                  {config.parent ? (
                    <TableCell>{parentNameOf(row) ?? "—"}</TableCell>
                  ) : null}
                  <TableCell>
                    <Badge variant={row.recordStatus === "active" ? "default" : "secondary"}>
                      {row.recordStatus === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => toggleStatus(row)}
                      >
                        {row.recordStatus === "active" ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Edit ${config.singular}`
                : `Add ${config.singular}`}
            </DialogTitle>
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
            {config.parent ? (
              <div className="space-y-2">
                <Label htmlFor={`${entity}-parent`}>{config.parent.label}</Label>
                <select
                  id={`${entity}-parent`}
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  required={config.parent.required}
                  className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="">
                    {config.parent.required ? `Select ${config.parent.label.toLowerCase()}…` : "None"}
                  </option>
                  {(parentOptions ?? []).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {editing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DataTableShell>
  );
}
