"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  listScInventoryAction,
  manualScStockInAction,
  searchSerialsForScStockInAction,
} from "@/features/service-center-ops/actions/sc-inventory.actions";
import {
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  useClientTablePagination,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { matchesTableSearch } from "@/utils/match-table-search";

type InventoryRow = Awaited<
  ReturnType<typeof listScInventoryAction>
>["items"][number];

type CenterOption = {
  id: string;
  name: string;
  sapCode: string;
  locations: { id: string; code: string; name: string }[];
};

type StatusOption = { id: string; code: string; name: string };

export function ScInventoryPanel({
  items,
  centers,
  statusOptions,
  canStockIn,
}: {
  items: InventoryRow[];
  centers: CenterOption[];
  statusOptions: StatusOption[];
  canStockIn: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [serviceCenterId, setServiceCenterId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [serialQuery, setSerialQuery] = useState("");
  const [serialOptions, setSerialOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [serialNumberId, setSerialNumberId] = useState("");

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
          row.serviceCenter.name,
          row.serviceCenter.sapCode,
          row.serviceCenterLocation.name,
          row.serialNumber.serialNo,
          row.serialNumber.model.skuCode,
          row.serialNumber.model.name,
          row.statusCode?.code ?? "",
          row.statusCode?.name ?? "",
        ]),
      ),
    [items, query],
  );

  const sort = useClientTableSort(filtered, {
    center: (row) => row.serviceCenter.name,
    serial: (row) => row.serialNumber.serialNo,
    model: (row) => row.serialNumber.model.skuCode,
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

  function openStockIn() {
    setServiceCenterId(centers[0]?.id ?? "");
    setLocationId(centers[0]?.locations[0]?.id ?? "");
    setSerialNumberId("");
    setSerialQuery("");
    setSerialOptions([]);
    setSheetOpen(true);
  }

  function searchSerials(value: string) {
    setSerialQuery(value);
    if (value.trim().length < 2) {
      setSerialOptions([]);
      return;
    }
    startTransition(async () => {
      const rows = await searchSerialsForScStockInAction(value);
      setSerialOptions(
        rows.map((r) => ({
          id: r.id,
          label: `${r.serialNo} · ${r.model.skuCode}`,
        })),
      );
    });
  }

  function submitStockIn() {
    if (!serviceCenterId || !locationId || !serialNumberId) {
      toast.error("Select center, location, and serial");
      return;
    }
    startTransition(async () => {
      const result = await manualScStockInAction({
        serviceCenterId,
        serviceCenterLocationId: locationId,
        serialNumberId,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Stocked in as STK");
      setSheetOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search serial, model, or center…",
        }}
        toolbarActions={
          canStockIn ? (
            <Button onClick={openStockIn} disabled={pending || centers.length === 0}>
              Manual stock-in
            </Button>
          ) : null
        }
        empty={items.length === 0}
        emptyMessage="No service center inventory yet."
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "unit",
          onPageChange: setPage,
        }}
      >
        <TableHeader>
          <TableRow>
            <TableIndexHead />
            <GlobalTableHead {...sort.sortProps("center")}>Center</GlobalTableHead>
            <GlobalTableHead>Location</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("serial")}>Serial</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("model")}>Model</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("status")}>Status</GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItems.length === 0 ? (
            <TableEmptyRow colSpan={6} message="No units match your search." />
          ) : (
            pageItems.map((row, index) => (
              <TableRow key={row.id}>
                <TableIndexCell index={indexOffset + index + 1} />
                <TableCell>
                  <div className="font-medium">{row.serviceCenter.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.serviceCenter.sapCode}
                  </div>
                </TableCell>
                <TableCell>
                  {row.serviceCenterLocation.name} ({row.serviceCenterLocation.code})
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {row.serialNumber.serialNo}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.serialNumber.model.skuCode}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.serialNumber.model.name}
                  </div>
                </TableCell>
                <TableCell>
                  {row.statusCode ? (
                    <Badge variant="secondary">{row.statusCode.code}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </GlobalDataTable>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-4 text-left">
            <SheetTitle>Manual stock-in</SheetTitle>
            <SheetDescription>
              Place an existing serial as STK at a service center location.
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
                const center = centers.find((c) => c.id === id);
                setLocationId(center?.locations[0]?.id ?? "");
              }}
              placeholder="Select center…"
              searchPlaceholder="Search centers…"
              disabled={pending}
            />
            <SearchableSelect
              label="Location"
              options={locations}
              value={locationId}
              onChange={setLocationId}
              placeholder="Select location…"
              searchPlaceholder="Search locations…"
              disabled={pending || !serviceCenterId}
            />
            <div className="space-y-2">
              <Label>Serial search</Label>
              <Input
                value={serialQuery}
                onChange={(e) => searchSerials(e.target.value)}
                placeholder="Type at least 2 characters…"
                disabled={pending}
              />
            </div>
            <SearchableSelect
              label="Serial"
              options={serialOptions}
              value={serialNumberId}
              onChange={setSerialNumberId}
              placeholder="Select serial…"
              searchPlaceholder="Filter results…"
              disabled={pending || serialOptions.length === 0}
            />
            {statusOptions.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Stock-in always sets status to STK.
              </p>
            ) : null}
          </div>
          <SheetFooter className="border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSheetOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitStockIn} disabled={pending}>
              {pending ? "Saving…" : "Stock in"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
