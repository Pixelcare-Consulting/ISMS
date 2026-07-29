"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SearchableMultiSelect } from "@/features/aors/components/searchable-multi-select";
import { deleteAorAction, syncUserAorsAction } from "@/features/aors/actions/aor.actions";
import {
  AppDataTable,
  AppDataTableBody,
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableSearchBar,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  TableRowCheckbox,
  uniqueSearchSuggestions,
  useTableSelection,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

const MAX_VISIBLE_BRANCHES = 3;

const assignedAtFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatAssignedAt(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return assignedAtFormatter.format(date);
}

function formatPerson(person: { name: string | null; email: string } | null | undefined) {
  if (!person) return "—";
  return person.name?.trim() || person.email || "—";
}

function branchLabel(branch: { name: string; sapCode: string } | null | undefined) {
  if (!branch) return null;
  return `${branch.name} (${branch.sapCode})`;
}

interface AorRow {
  id: string;
  createdAt: string | Date;
  user: { id: string; name: string | null; email: string };
  createdBy: { name: string | null; email: string } | null;
  branch: { id: string; name: string; sapCode: string } | null;
  warehouse: { id: string; name: string; code: string } | null;
  dealer: { id: string; name: string; sapCode: string | null } | null;
}

type BranchOption = {
  id: string;
  name: string;
  sapCode: string;
  dealerId: string | null;
  label: string;
};

type DealerOption = {
  id: string;
  name: string;
  sapCode: string | null;
  branchCount: number;
  label: string;
};

type WarehouseOption = {
  id: string;
  name: string;
  code: string;
  label: string;
};

type AorUserGroup = {
  userId: string;
  user: { id: string; name: string | null; email: string };
  aors: AorRow[];
  latestCreatedAt: string | Date;
  assignedByLabel: string;
};

function toTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

function groupAorsByUser(rows: AorRow[]): AorUserGroup[] {
  const byUser = new Map<string, AorRow[]>();

  for (const row of rows) {
    const key = row.user.id;
    const existing = byUser.get(key);
    if (existing) {
      existing.push(row);
    } else {
      byUser.set(key, [row]);
    }
  }

  const groups: AorUserGroup[] = [];

  for (const [userId, aors] of byUser) {
    const sorted = [...aors].sort(
      (a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt),
    );
    const latestCreatedAt = sorted[0]?.createdAt ?? new Date(0);

    const actorKeys = new Set(
      sorted.map((aor) => {
        if (!aor.createdBy) return "__none__";
        return `${aor.createdBy.email}::${aor.createdBy.name ?? ""}`;
      }),
    );

    let assignedByLabel = "—";
    if (actorKeys.size > 1) {
      assignedByLabel = "Multiple";
    } else if (sorted[0]?.createdBy) {
      assignedByLabel = formatPerson(sorted[0].createdBy);
    }

    groups.push({
      userId,
      user: sorted[0]?.user ?? { id: userId, name: null, email: "" },
      aors: sorted,
      latestCreatedAt,
      assignedByLabel,
    });
  }

  return groups.sort(
    (a, b) => toTimestamp(b.latestCreatedAt) - toTimestamp(a.latestCreatedAt),
  );
}

function selectionsForUser(
  userAors: AorRow[],
  branches: BranchOption[],
  dealers: DealerOption[],
) {
  const branchIds = [
    ...new Set(
      userAors
        .map((aor) => aor.branch?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const warehouseIds = [
    ...new Set(
      userAors
        .map((aor) => aor.warehouse?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const dealerIdsFromRows = [
    ...new Set(
      userAors
        .map((aor) => aor.dealer?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const assignedBranchSet = new Set(branchIds);
  const branchIdsByDealer = new Map<string, string[]>();
  for (const branch of branches) {
    if (!branch.dealerId) continue;
    const list = branchIdsByDealer.get(branch.dealerId) ?? [];
    list.push(branch.id);
    branchIdsByDealer.set(branch.dealerId, list);
  }

  const inferredDealerIds = dealers
    .filter((dealer) => {
      if (dealerIdsFromRows.includes(dealer.id)) return false;
      const ids = branchIdsByDealer.get(dealer.id) ?? [];
      return ids.length > 0 && ids.every((id) => assignedBranchSet.has(id));
    })
    .map((dealer) => dealer.id);

  return {
    branchIds,
    dealerIds: [...new Set([...dealerIdsFromRows, ...inferredDealerIds])],
    warehouseIds,
  };
}

function mapSyncedAorRow(
  aor: {
    id: string;
    createdAt: string | Date;
    user: { id: string; name: string | null; email: string };
    createdBy: { name: string | null; email: string } | null;
    branch: { id: string; name: string; sapCode: string } | null;
    warehouse: { id: string; name: string; code: string } | null;
    dealer: { id: string; name: string; sapCode: string | null } | null;
    branchId?: string | null;
    warehouseId?: string | null;
  },
  selectedUser: { name: string | null; email: string } | undefined,
  branchById: Map<string, BranchOption>,
  warehouseById: Map<string, WarehouseOption>,
): AorRow {
  const branch =
    aor.branch ??
    (aor.branchId ? branchById.get(aor.branchId) : undefined) ??
    null;
  const warehouse =
    aor.warehouse ??
    (aor.warehouseId ? warehouseById.get(aor.warehouseId) : undefined) ??
    null;

  return {
    id: aor.id,
    createdAt: aor.createdAt,
    user: {
      id: aor.user.id,
      name: selectedUser?.name ?? aor.user.name,
      email: selectedUser?.email ?? aor.user.email,
    },
    createdBy: aor.createdBy
      ? { name: aor.createdBy.name, email: aor.createdBy.email }
      : null,
    branch: branch
      ? { id: branch.id, name: branch.name, sapCode: branch.sapCode }
      : null,
    warehouse: warehouse
      ? { id: warehouse.id, name: warehouse.name, code: warehouse.code }
      : null,
    dealer: aor.dealer
      ? { id: aor.dealer.id, name: aor.dealer.name, sapCode: aor.dealer.sapCode }
      : null,
  };
}

export function AorsTable({
  aors,
  users,
  branches,
  dealers,
  warehouses,
}: {
  aors: AorRow[];
  users: { id: string; name: string | null; email: string; label: string }[];
  branches: BranchOption[];
  dealers: DealerOption[];
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(aors);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [removingAll, setRemovingAll] = useState<AorUserGroup | null>(null);
  const [viewingAll, setViewingAll] = useState<AorUserGroup | null>(null);
  const [removingOne, setRemovingOne] = useState<{
    id: string;
    label: string;
    userLabel: string;
  } | null>(null);

  useEffect(() => {
    setRows(aors);
  }, [aors]);

  useEffect(() => {
    if (!userId) {
      setSelectedBranchIds([]);
      setSelectedDealerIds([]);
      setSelectedWarehouseIds([]);
      return;
    }

    const userAors = rows.filter((row) => row.user.id === userId);
    const next = selectionsForUser(userAors, branches, dealers);
    setSelectedBranchIds(next.branchIds);
    setSelectedDealerIds(next.dealerIds);
    setSelectedWarehouseIds(next.warehouseIds);
  }, [userId, rows, branches, dealers]);

  const branchOptions = useMemo(
    () =>
      branches.map((branch) => ({
        id: branch.id,
        label: branch.label,
      })),
    [branches],
  );

  const dealerOptions = useMemo(
    () =>
      dealers.map((dealer) => ({
        id: dealer.id,
        label: dealer.label,
        description: `${dealer.branchCount} branch${dealer.branchCount === 1 ? "" : "es"}`,
      })),
    [dealers],
  );

  const warehouseOptions = useMemo(
    () =>
      warehouses.map((warehouse) => ({
        id: warehouse.id,
        label: warehouse.label,
      })),
    [warehouses],
  );

  const groups = useMemo(() => groupAorsByUser(rows), [rows]);

  const filtered = useMemo(
    () =>
      groups.filter((group) =>
        matchesTableSearch(query, [
          group.user.name,
          group.user.email,
          group.assignedByLabel,
          formatAssignedAt(group.latestCreatedAt),
          ...group.aors.flatMap((aor) => [
            aor.branch?.name ?? "",
            aor.branch?.sapCode ?? "",
            branchLabel(aor.branch) ?? "",
            aor.warehouse?.name ?? "",
            aor.warehouse?.code ?? "",
          ]),
        ]),
      ),
    [groups, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        groups.map((group) => group.user.name),
        groups.map((group) => group.user.email),
        groups.map((group) => group.assignedByLabel),
        groups.flatMap((group) =>
          group.aors.flatMap((aor) => [
            aor.branch?.name,
            aor.branch?.sapCode,
            branchLabel(aor.branch),
            aor.warehouse?.name,
            aor.warehouse?.code,
          ]),
        ),
      ),
    [groups],
  );

  const selection = useTableSelection(filtered.map((group) => group.userId));

  const canAssign =
    Boolean(userId) &&
    (selectedBranchIds.length > 0 ||
      selectedDealerIds.length > 0 ||
      selectedWarehouseIds.length > 0);

  function assign() {
    if (!canAssign) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", userId);
      for (const branchId of selectedBranchIds) {
        fd.append("branchIds", branchId);
      }
      for (const dealerId of selectedDealerIds) {
        fd.append("dealerIds", dealerId);
      }
      for (const warehouseId of selectedWarehouseIds) {
        fd.append("warehouseIds", warehouseId);
      }

      const result = await syncUserAorsAction(fd);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }

      const createdCount = result.createdCount ?? 0;
      const deletedCount = result.deletedCount ?? 0;
      if (createdCount === 0 && deletedCount === 0) {
        toast.message("No AOR changes");
      } else if (deletedCount > 0 && createdCount > 0) {
        toast.success(
          `Synced AORs (+${createdCount}, −${deletedCount})`,
        );
      } else if (deletedCount > 0) {
        toast.success(`Removed ${deletedCount} AOR${deletedCount === 1 ? "" : "s"}`);
      } else {
        toast.success(`Assigned ${createdCount} AOR${createdCount === 1 ? "" : "s"}`);
      }

      if (result.aors) {
        const selectedUser = users.find((user) => user.id === userId);
        const branchById = new Map(branches.map((branch) => [branch.id, branch]));
        const warehouseById = new Map(
          warehouses.map((warehouse) => [warehouse.id, warehouse]),
        );
        const syncedRows = result.aors.map((aor) =>
          mapSyncedAorRow(aor, selectedUser, branchById, warehouseById),
        );
        setRows((currentRows) => [
          ...syncedRows,
          ...currentRows.filter((row) => row.user.id !== userId),
        ]);
      }
      router.refresh();
    });
  }

  function removeOne() {
    if (!removingOne) return;
    const { id } = removingOne;

    startTransition(async () => {
      const result = await deleteAorAction(id);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Branch removed");
      setRows((currentRows) => currentRows.filter((row) => row.id !== id));
      setRemovingOne(null);
      setViewingAll((current) => {
        if (!current) return current;
        const nextAors = current.aors.filter((aor) => aor.id !== id);
        if (nextAors.length === 0) return null;
        return { ...current, aors: nextAors };
      });
      router.refresh();
    });
  }

  function removeAllForUser() {
    if (!removingAll) return;
    const ids = removingAll.aors.map((aor) => aor.id);
    const userLabel = formatPerson(removingAll.user);
    const removedUserId = removingAll.userId;

    startTransition(async () => {
      for (const id of ids) {
        const result = await deleteAorAction(id);
        if (result.error) {
          toast.error(String(result.error));
          router.refresh();
          return;
        }
      }
      toast.success(`Removed all AORs for ${userLabel}`);
      setRows((currentRows) =>
        currentRows.filter((row) => row.user.id !== removedUserId),
      );
      setRemovingAll(null);
      setViewingAll((current) =>
        current?.userId === removedUserId ? null : current,
      );
      router.refresh();
    });
  }

  function requestRemoveBranch(aor: AorRow, userLabel: string) {
    const label = branchLabel(aor.branch) ?? "No branch";
    setRemovingOne({ id: aor.id, label, userLabel });
  }

  const viewingBranchAors = viewingAll
    ? viewingAll.aors.filter((aor) => aor.branch)
    : [];

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <SearchableSelect
          label="User"
          className="min-w-[200px]"
          options={users.map((u) => ({ id: u.id, label: u.label }))}
          value={userId}
          onChange={setUserId}
          placeholder="Select user…"
          searchPlaceholder="Search users…"
          disabled={pending}
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SearchableMultiSelect
            label="Branches"
            options={branchOptions}
            selectedIds={selectedBranchIds}
            onChange={setSelectedBranchIds}
            placeholder="Search and select branches…"
            searchPlaceholder="Filter branches…"
            emptyMessage="No branches available."
            disabled={pending}
          />
          <SearchableMultiSelect
            label="Dealers"
            options={dealerOptions}
            selectedIds={selectedDealerIds}
            onChange={setSelectedDealerIds}
            placeholder="Search and select dealers…"
            searchPlaceholder="Filter dealers…"
            emptyMessage="No dealers available."
            hint="Selecting a dealer assigns all of its active branches."
            disabled={pending}
          />
          <SearchableMultiSelect
            label="Warehouses"
            options={warehouseOptions}
            selectedIds={selectedWarehouseIds}
            onChange={setSelectedWarehouseIds}
            placeholder="Search and select warehouses…"
            searchPlaceholder="Filter warehouses…"
            emptyMessage="No warehouses available."
            disabled={pending}
          />
        </div>

        <Button disabled={pending || !canAssign} onClick={assign}>
          Save AOR
        </Button>
      </div>

      <AppDataTable
        shellHeader={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TableSearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search users or branches…"
              suggestions={suggestions}
              className="sm:max-w-sm"
            />
            <TableSelectionBadge
              count={selection.selectedCount}
              onClear={selection.clearSelection}
            />
          </div>
        }
        empty={rows.length === 0}
        emptyMessage="No AORs assigned yet."
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow>
                <TableSelectAllCheckbox
                  isAllSelected={selection.isAllSelected}
                  isPartiallySelected={selection.isPartiallySelected}
                  onToggleAll={selection.toggleAll}
                  aria-label="Select all AOR users"
                />
                <TableIndexHead />
                <TableHead>User</TableHead>
                <TableHead>Branches</TableHead>
                <TableHead>Assigned at</TableHead>
                <TableHead>Assigned by</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={7} message="No AORs match your search." />
              ) : (
                filtered.map((group, index) => {
                  const branchAors = group.aors.filter((aor) => aor.branch);
                  const branchCount = branchAors.length;
                  const visibleAors = branchAors.slice(0, MAX_VISIBLE_BRANCHES);
                  const hasOverflow = branchCount > MAX_VISIBLE_BRANCHES;
                  const userLabel = formatPerson(group.user);
                  return (
                    <TableRow
                      key={group.userId}
                      data-state={
                        selection.isRowSelected(group.userId) ? "selected" : undefined
                      }
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
                    >
                      <TableRowCheckbox
                        checked={selection.isRowSelected(group.userId)}
                        onCheckedChange={(checked) =>
                          selection.toggleRow(group.userId, checked)
                        }
                        aria-label={`Select AOR user ${userLabel}`}
                      />
                      <TableIndexCell index={index + 1} />
                      <TableCell>
                        <div className="font-medium">{userLabel}</div>
                        {group.user.name ? (
                          <div className="text-xs text-muted-foreground">
                            {group.user.email}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {branchCount === 0 ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-1">
                            <ul className="space-y-0.5">
                              {visibleAors.map((aor) => (
                                <li key={aor.id} className="min-w-0 text-sm">
                                  <div className="truncate font-medium leading-snug">
                                    {aor.branch?.name ?? "—"}
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    {aor.branch?.sapCode ?? "—"}
                                  </div>
                                </li>
                              ))}
                            </ul>
                            {hasOverflow ? (
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto px-0 py-0 text-xs"
                                onClick={() => setViewingAll(group)}
                                disabled={pending}
                              >
                                View all ({branchCount})
                              </Button>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {branchCount} branch
                                {branchCount === 1 ? "" : "es"}
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatAssignedAt(group.latestCreatedAt)}
                      </TableCell>
                      <TableCell>{group.assignedByLabel}</TableCell>
                      <TableRowActions
                        onDelete={() => setRemovingAll(group)}
                        deleteTitle="Remove all AORs"
                        deleteDisabled={pending}
                      />
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </AppDataTableBody>
      </AppDataTable>

      <Dialog
        open={Boolean(viewingAll)}
        onOpenChange={(open) => !open && setViewingAll(null)}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader className="shrink-0 pb-4">
            <DialogTitle>
              Branches for {viewingAll ? formatPerson(viewingAll.user) : "user"}
            </DialogTitle>
            <DialogDescription>
              {viewingAll
                ? `${viewingBranchAors.length} branch assignment${
                    viewingBranchAors.length === 1 ? "" : "s"
                  }`
                : "All branch assignments for this user."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>SAP / code</TableHead>
                  <TableHead>Assigned at</TableHead>
                  <TableHead>Assigned by</TableHead>
                  <TableHead className="w-16 text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewingAll
                  ? viewingBranchAors.map((aor, index) => {
                        const userLabel = formatPerson(viewingAll.user);
                        const label = branchLabel(aor.branch) ?? "No branch";
                        return (
                          <TableRow
                            key={aor.id}
                            className={cn(index % 2 === 1 && "bg-table-stripe")}
                          >
                            <TableCell className="font-medium">
                              {aor.branch?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {aor.branch?.sapCode ?? "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatAssignedAt(aor.createdAt)}
                            </TableCell>
                            <TableCell>
                              {formatPerson(aor.createdBy)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 cursor-pointer text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  requestRemoveBranch(aor, userLabel)
                                }
                                aria-label={`Remove ${label}`}
                                disabled={pending}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                  : null}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(removingOne)}
        onOpenChange={(open) => !open && setRemovingOne(null)}
        title="Remove branch assignment?"
        description={
          removingOne
            ? `Remove ${removingOne.label} from ${removingOne.userLabel}? This cannot be undone from here.`
            : "Remove this branch assignment?"
        }
        confirmLabel="Remove"
        onConfirm={removeOne}
        pending={pending}
      />

      <DeleteConfirmDialog
        open={Boolean(removingAll)}
        onOpenChange={(open) => !open && setRemovingAll(null)}
        title="Remove all AORs?"
        description={
          removingAll
            ? `Remove all ${removingAll.aors.length} branch assignment${
                removingAll.aors.length === 1 ? "" : "s"
              } for ${formatPerson(removingAll.user)}?`
            : "Remove all branch assignments for this user?"
        }
        confirmLabel="Remove"
        onConfirm={removeAllForUser}
        pending={pending}
      />
    </div>
  );
}
