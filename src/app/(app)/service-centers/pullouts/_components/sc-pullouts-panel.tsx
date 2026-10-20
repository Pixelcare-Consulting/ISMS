"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import {
  approveScPulloutAction,
  completeScPulloutAction,
  createScPulloutAction,
  listScPulloutsAction,
  listScStkSerialsForLogisticsAction,
} from "@/features/service-center-ops/actions/sc-logistics.actions";
import type { ScLogisticsActionCapabilities } from "@/features/service-center-ops/constants/sc-permissions";
import { SearchableMultiSelect } from "@/features/aors/components/searchable-multi-select";
import { useClientTablePagination } from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type PulloutRow = Awaited<ReturnType<typeof listScPulloutsAction>>["items"][number];
type CenterOption = Awaited<ReturnType<typeof listScCentersForOpsAction>>[number];

const pulloutColumn = createColumnHelper<DataTableFeatures, PulloutRow>();

export function ScPulloutsPanel({
  items,
  centers,
  capabilities,
}: {
  items: PulloutRow[];
  centers: CenterOption[];
  capabilities: ScLogisticsActionCapabilities;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [serviceCenterId, setServiceCenterId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [serialOptions, setSerialOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);

  const locations = useMemo(() => {
    const center = centers.find((c) => c.id === serviceCenterId);
    return (center?.locations ?? []).map((l) => ({
      id: l.id,
      label: `${l.name} (${l.code})`,
    }));
  }, [centers, serviceCenterId]);

  const filtered = useMemo(
    () =>
      items.filter((row) =>
        matchesTableSearch(query, [
          row.pulloutNo,
          row.serviceCenter.name,
          row.statusCode?.code ?? "",
        ]),
      ),
    [items, query],
  );

  const sort = useClientTableSort(filtered, {
    pullout: (row) => row.pulloutNo,
    center: (row) => row.serviceCenter.name,
    status: (row) => row.statusCode?.code ?? "",
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

  function loadSerials(centerId: string, locId: string) {
    if (!centerId || !locId) {
      setSerialOptions([]);
      return;
    }
    startTransition(async () => {
      const rows = await listScStkSerialsForLogisticsAction(centerId, locId);
      setSerialOptions(
        rows.map((r) => ({
          id: r.serialNumberId,
          label: `${r.serialNo} · ${r.skuCode}`,
        })),
      );
    });
  }

  function openCreate() {
    const centerId = centers[0]?.id ?? "";
    const locId = centers[0]?.locations[0]?.id ?? "";
    setServiceCenterId(centerId);
    setLocationId(locId);
    setSelectedSerialIds([]);
    setSheetOpen(true);
    loadSerials(centerId, locId);
  }

  function submitCreate() {
    if (!serviceCenterId || !locationId || selectedSerialIds.length === 0) {
      toast.error("Select center, location, and serials");
      return;
    }
    startTransition(async () => {
      const result = await createScPulloutAction({
        serviceCenterId,
        serviceCenterLocationId: locationId,
        serialNumberIds: selectedSerialIds,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Pull-out ${result.pulloutNo} created`);
      setSheetOpen(false);
      router.refresh();
    });
  }

  function run(
    action: () => Promise<{ error?: string; success?: true }>,
    ok: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<PulloutRow>[] = [
      pulloutColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      pulloutColumn.accessor((row) => row.pulloutNo, {
        id: "pullout",
        header: "Pull-out",
        enableSorting: true,
        meta: { className: "font-medium" },
      }),
      pulloutColumn.accessor((row) => row.serviceCenter.name, {
        id: "center",
        header: "Center",
        enableSorting: true,
      }),
      pulloutColumn.display({
        id: "serials",
        header: "Serials",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.details.map((detail) => detail.serialNumber.serialNo).join(", ") || "—",
      }),
      pulloutColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.statusCode?.code || "—"}</Badge>
        ),
      }),
      pulloutColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const pullout = row.original;
          const code = pullout.statusCode?.code ?? "";
          return (
            <div className="flex flex-col gap-1">
              {capabilities.canApprovePullout && code === "pending_tl" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => approveScPulloutAction(pullout.id), "Pull-out approved")
                  }
                >
                  Approve
                </Button>
              ) : null}
              {capabilities.canCompletePullout &&
              ["for_pullout", "in_transit", "pending_logistics"].includes(code) ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => completeScPulloutAction(pullout.id), "Pull-out completed")
                  }
                >
                  Complete
                </Button>
              ) : null}
            </div>
          );
        },
      }),
    ];
    return cols;
  }, [
    capabilities.canApprovePullout,
    capabilities.canCompletePullout,
    indexOffset,
    pending,
  ]);

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
          placeholder: "Search pull-out or center…",
        }}
        toolbarActions={
          capabilities.canCreate ? (
            <Button onClick={openCreate} disabled={pending || centers.length === 0}>
              New pull-out
            </Button>
          ) : null
        }
        empty={pageItems.length === 0}
        emptyMessage={
          items.length === 0
            ? "No service center pull-outs yet."
            : "No pull-outs match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "pull-out",
          onPageChange: setPage,
        }}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-4 text-left">
            <SheetTitle>New service center pull-out</SheetTitle>
            <SheetDescription>
              Reserve STK serials for pull-out. Completing removes them from
              service center inventory.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <SearchableSelect
              label="Service center"
              options={centers.map((c) => ({
                id: c.id,
                label: `${c.name} (${c.sapCode})`,
              }))}
              value={serviceCenterId}
              onChange={(id) => {
                setServiceCenterId(id);
                const locId =
                  centers.find((c) => c.id === id)?.locations[0]?.id ?? "";
                setLocationId(locId);
                setSelectedSerialIds([]);
                loadSerials(id, locId);
              }}
              placeholder="Select center…"
              searchPlaceholder="Search…"
              disabled={pending}
            />
            <SearchableSelect
              label="Location"
              options={locations}
              value={locationId}
              onChange={(id) => {
                setLocationId(id);
                setSelectedSerialIds([]);
                loadSerials(serviceCenterId, id);
              }}
              placeholder="Select location…"
              searchPlaceholder="Search…"
              disabled={pending}
            />
            <SearchableMultiSelect
              label="STK serials"
              options={serialOptions}
              selectedIds={selectedSerialIds}
              onChange={setSelectedSerialIds}
              placeholder="Select serials…"
              searchPlaceholder="Filter…"
              emptyMessage="No STK serials at this location."
              disabled={pending}
            />
          </div>
          <SheetFooter className="border-t">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={pending}>
              {pending ? "Saving…" : "Create pull-out"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
