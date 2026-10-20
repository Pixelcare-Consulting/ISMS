"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SearchableMultiSelect } from "@/features/aors/components/searchable-multi-select";
import { deleteAorAction, syncUserAorsAction } from "@/features/aors/actions/aor.actions";
import {
  DeleteConfirmDialog,
  TableRowActions,
  TableSelectionBadge,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const aorColumn = createColumnHelper<DataTableFeatures, AorUserGroup>();
const viewColumn = createColumnHelper<DataTableFeatures, AorRow>();

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
  serviceCenter: { id: string; name: string; sapCode: string } | null;
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

type ServiceCenterOption = {
  id: string;
  name: string;
  sapCode: string;
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
  inferDealers = true,
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
  const serviceCenterIds = [
    ...new Set(
      userAors
        .map((aor) => aor.serviceCenter?.id)
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

  const inferredDealerIds = inferDealers
    ? dealers
        .filter((dealer) => {
          if (dealerIdsFromRows.includes(dealer.id)) return false;
          const ids = branchIdsByDealer.get(dealer.id) ?? [];
          return ids.length > 0 && ids.every((id) => assignedBranchSet.has(id));
        })
        .map((dealer) => dealer.id)
    : [];

  return {
    branchIds,
    dealerIds: [...new Set([...dealerIdsFromRows, ...inferredDealerIds])],
    warehouseIds,
    serviceCenterIds,
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
    serviceCenter: { id: string; name: string; sapCode: string } | null;
    branchId?: string | null;
    warehouseId?: string | null;
    serviceCenterId?: string | null;
  },
  selectedUser: { name: string | null; email: string } | undefined,
  branchById: Map<string, BranchOption>,
  warehouseById: Map<string, WarehouseOption>,
  serviceCenterById: Map<string, ServiceCenterOption>,
): AorRow {
  const branch =
    aor.branch ??
    (aor.branchId ? branchById.get(aor.branchId) : undefined) ??
    null;
  const warehouse =
    aor.warehouse ??
    (aor.warehouseId ? warehouseById.get(aor.warehouseId) : undefined) ??
    null;
  const serviceCenter =
    aor.serviceCenter ??
    (aor.serviceCenterId
      ? serviceCenterById.get(aor.serviceCenterId)
      : undefined) ??
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
    serviceCenter: serviceCenter
      ? {
          id: serviceCenter.id,
          name: serviceCenter.name,
          sapCode: serviceCenter.sapCode,
        }
      : null,
  };
}

export function AorsTable({
  aors,
  users,
  branches,
  dealers,
  warehouses,
  serviceCenters,
}: {
  aors: AorRow[];
  users: { id: string; name: string | null; email: string; label: string }[];
  branches: BranchOption[];
  dealers: DealerOption[];
  warehouses: WarehouseOption[];
  serviceCenters: ServiceCenterOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(aors);
  const [aorsSnapshot, setAorsSnapshot] = useState(aors);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"assign" | "edit">("assign");
  const [userId, setUserId] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [selectedServiceCenterIds, setSelectedServiceCenterIds] = useState<
    string[]
  >([]);
  const [removingAll, setRemovingAll] = useState<AorUserGroup | null>(null);
  const [viewingAll, setViewingAll] = useState<AorUserGroup | null>(null);
  const [removingOne, setRemovingOne] = useState<{
    id: string;
    label: string;
    userLabel: string;
  } | null>(null);

  // Keep local optimistic rows in sync when server props change (no effect).
  if (aors !== aorsSnapshot) {
    setAorsSnapshot(aors);
    setRows(aors);
  }

  function selectUserForAssign(nextUserId: string) {
    setUserId(nextUserId);
    if (!nextUserId) {
      setSelectedBranchIds([]);
      setSelectedDealerIds([]);
      setSelectedWarehouseIds([]);
      setSelectedServiceCenterIds([]);
      return;
    }

    const userAors = rows.filter((row) => row.user.id === nextUserId);
    const next = selectionsForUser(userAors, branches, dealers);
    setSelectedBranchIds(next.branchIds);
    setSelectedDealerIds(next.dealerIds);
    setSelectedWarehouseIds(next.warehouseIds);
    setSelectedServiceCenterIds(next.serviceCenterIds);
  }

  const userSelectOptions = useMemo(() => {
    const options = users.map((user) => ({ id: user.id, label: user.label }));
    if (userId && !options.some((option) => option.id === userId)) {
      const match = rows.find((row) => row.user.id === userId);
      if (match) {
        options.unshift({ id: match.user.id, label: formatPerson(match.user) });
      }
    }
    return options;
  }, [users, userId, rows]);

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

  const serviceCenterOptions = useMemo(
    () =>
      serviceCenters.map((center) => ({
        id: center.id,
        label: center.label,
      })),
    [serviceCenters],
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
            aor.serviceCenter?.name ?? "",
            aor.serviceCenter?.sapCode ?? "",
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
            aor.serviceCenter?.name,
            aor.serviceCenter?.sapCode,
          ]),
        ),
      ),
    [groups],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = filtered.filter((group) => rowSelection[group.userId]).length;
  const sort = useClientTableSort(filtered, {
    user: (group) => formatPerson(group.user),
    branches: (group) => group.aors.filter((aor) => aor.branch).length,
    assignedAt: (group) => new Date(group.latestCreatedAt),
    assignedBy: (group) => group.assignedByLabel,
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

  const canAssign =
    Boolean(userId) &&
    (selectedBranchIds.length > 0 ||
      selectedDealerIds.length > 0 ||
      selectedWarehouseIds.length > 0 ||
      selectedServiceCenterIds.length > 0);

  function openAssign() {
    setSheetMode("assign");
    setUserId("");
    setSelectedBranchIds([]);
    setSelectedDealerIds([]);
    setSelectedWarehouseIds([]);
    setSelectedServiceCenterIds([]);
    setSheetOpen(true);
  }

  function openEdit(group: AorUserGroup) {
    const next = selectionsForUser(group.aors, branches, dealers, false);
    setSheetMode("edit");
    setUserId(group.userId);
    setSelectedBranchIds(next.branchIds);
    setSelectedDealerIds(next.dealerIds);
    setSelectedWarehouseIds(next.warehouseIds);
    setSelectedServiceCenterIds(next.serviceCenterIds);
    setViewingAll(null);
    setSheetOpen(true);
  }

  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) setSheetMode("assign");
  }

  function assign() {
    if (!canAssign) return;
    const editing = sheetMode === "edit";

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
      for (const serviceCenterId of selectedServiceCenterIds) {
        fd.append("serviceCenterIds", serviceCenterId);
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
      } else if (editing) {
        toast.success("AOR updated");
      } else if (deletedCount > 0 && createdCount > 0) {
        toast.success(
          `Synced AORs (+${createdCount}, âˆ’${deletedCount})`,
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
        const serviceCenterById = new Map(
          serviceCenters.map((center) => [center.id, center]),
        );
        const syncedRows = result.aors.map(
          (aor: Parameters<typeof mapSyncedAorRow>[0]) =>
            mapSyncedAorRow(
              aor,
              selectedUser,
              branchById,
              warehouseById,
              serviceCenterById,
            ),
        );
        setRows((currentRows) => [
          ...syncedRows,
          ...currentRows.filter((row) => row.user.id !== userId),
        ]);
      }

      setUserId("");
      setSelectedBranchIds([]);
      setSelectedDealerIds([]);
      setSelectedWarehouseIds([]);
      setSelectedServiceCenterIds([]);
      onSheetOpenChange(false);
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<AorUserGroup>[] = [
      aorColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      aorColumn.display({
        id: "user",
        header: "User",
        enableSorting: true,
        cell: ({ row }) => {
          const userLabel = formatPerson(row.original.user);
          return (
            <div>
              <div className="font-medium">{userLabel}</div>
              {row.original.user.name ? (
                <div className="text-xs text-muted-foreground">{row.original.user.email}</div>
              ) : null}
            </div>
          );
        },
      }),
      aorColumn.display({
        id: "branches",
        header: "Branches",
        enableSorting: true,
        cell: ({ row }) => {
          const branchAors = row.original.aors.filter((aor) => aor.branch);
          const branchCount = branchAors.length;
          const visibleAors = branchAors.slice(0, MAX_VISIBLE_BRANCHES);
          const hasOverflow = branchCount > MAX_VISIBLE_BRANCHES;
          if (branchCount === 0) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          return (
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
                  onClick={() => setViewingAll(row.original)}
                  disabled={pending}
                >
                  View all ({branchCount})
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {branchCount} branch{branchCount === 1 ? "" : "es"}
                </p>
              )}
            </div>
          );
        },
        meta: { wrap: true },
      }),
      aorColumn.display({
        id: "assignedAt",
        header: "Assigned at",
        enableSorting: true,
        cell: ({ row }) => formatAssignedAt(row.original.latestCreatedAt),
        meta: { className: "text-muted-foreground" },
      }),
      aorColumn.display({
        id: "assignedBy",
        header: "Assigned by",
        enableSorting: true,
        cell: ({ row }) => row.original.assignedByLabel,
      }),
      aorColumn.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions
            asCell={false}
            onEdit={() => openEdit(row.original)}
            editTitle="Edit AOR"
            editDisabled={pending}
            onDelete={() => setRemovingAll(row.original)}
            deleteTitle="Remove all AORs"
            deleteDisabled={pending}
          />
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [indexOffset, pending]);

  const viewColumns = useMemo(() => {
    const userLabel = viewingAll ? formatPerson(viewingAll.user) : "user";
    const cols: DataTableColumn<AorRow>[] = [
      viewColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: false,
        cell: ({ row }) => row.original.branch?.name ?? "—",
        meta: { className: "font-medium" },
      }),
      viewColumn.display({
        id: "sap",
        header: "SAP / code",
        enableSorting: false,
        cell: ({ row }) => row.original.branch?.sapCode ?? "—",
        meta: { className: "text-muted-foreground" },
      }),
      viewColumn.display({
        id: "assignedAt",
        header: "Assigned at",
        enableSorting: false,
        cell: ({ row }) => formatAssignedAt(row.original.createdAt),
        meta: { className: "whitespace-nowrap text-muted-foreground" },
      }),
      viewColumn.display({
        id: "assignedBy",
        header: "Assigned by",
        enableSorting: false,
        cell: ({ row }) => formatPerson(row.original.createdBy),
      }),
      viewColumn.display({
        id: "remove",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const label = branchLabel(row.original.branch) ?? "No branch";
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 cursor-pointer text-muted-foreground hover:text-destructive"
              onClick={() => requestRemoveBranch(row.original, userLabel)}
              aria-label={`Remove ${label}`}
              disabled={pending}
            >
              <Trash2 className="size-4" />
            </Button>
          );
        },
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [pending, viewingAll]);

  return (
    <div className="space-y-4">
      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.userId}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort.sortKey,
          sortDir: sort.sortDir,
          onSort: sort.toggleSort,
        }}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all AOR users"
        getSelectionLabel={(row) => `Select AOR user ${formatPerson(row.user)}`}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search users or branches…",
          suggestions,
        }}
        toolbarLeading={
          <TableSelectionBadge count={selectedCount} onClear={() => setRowSelection({})} />
        }
        toolbarActions={
          <Button onClick={openAssign} disabled={pending}>
            <Plus className="size-4" />
            Assign AOR
          </Button>
        }
        empty={pageItems.length === 0}
        emptyMessage={
          rows.length === 0 ? "No AORs assigned yet." : "No AORs match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "user",
          onPageChange: setPage,
        }}
      />

      <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>
              {sheetMode === "edit" ? "Edit AOR" : "Assign AOR"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "edit"
                ? "Update branches, dealers, warehouses, or service centers for this user. Locations you leave selected stay assigned."
                : "Assign branches, dealers, warehouses, or service centers to a user. Selecting a dealer assigns all of its active branches."}
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              assign();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <SearchableSelect
                label="User"
                options={userSelectOptions}
                value={userId}
                onChange={selectUserForAssign}
                placeholder="Select user…"
                searchPlaceholder="Search users…"
                disabled={pending || sheetMode === "edit"}
              />
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
              <SearchableMultiSelect
                label="Service centers"
                options={serviceCenterOptions}
                selectedIds={selectedServiceCenterIds}
                onChange={setSelectedServiceCenterIds}
                placeholder="Search and select service centers…"
                searchPlaceholder="Filter service centers…"
                emptyMessage="No service centers available."
                disabled={pending}
              />
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => onSheetOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !canAssign}>
                {pending
                  ? "Saving…"
                  : sheetMode === "edit"
                    ? "Save changes"
                    : "Save AOR"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

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
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DataTable
              chrome="plain"
              data={viewingBranchAors}
              columns={viewColumns}
              getRowId={(row) => row.id}
              stickyHeader
              empty={viewingBranchAors.length === 0}
              emptyMessage="No branch assignments."
            />
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
