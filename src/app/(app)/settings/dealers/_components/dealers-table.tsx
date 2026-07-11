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
  AppDataTable,
  AppDataTableBody,
  DeleteConfirmDialog,
  TableEmptyRow,
  TableRowActions,
  TableSearchBar,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
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

  async function ensureOptions() {
    if (options) return options;
    const loaded = await listDealerFormOptionsAction();
    setOptions(loaded);
    return loaded;
  }

  function createDealer() {
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
      setName("");
      setSapCode("");
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
      <div
        className="flex flex-wrap gap-2 rounded-xl border bg-card p-4 shadow-sm"
        onFocus={() => {
          void ensureOptions();
        }}
      >
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>SAP code</Label>
          <Input value={sapCode} onChange={(e) => setSapCode(e.target.value)} />
        </div>
        {options ? (
          <>
            <div>
              <Label>Area</Label>
              <select
                className="flex h-9 rounded-md border bg-background px-2 text-sm"
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
              >
                <option value="">—</option>
                {options.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Dealer type</Label>
              <select
                className="flex h-9 rounded-md border bg-background px-2 text-sm"
                value={dealerTypeId}
                onChange={(e) => setDealerTypeId(e.target.value)}
              >
                <option value="">—</option>
                {options.dealerTypes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Dealer area</Label>
              <select
                className="flex h-9 rounded-md border bg-background px-2 text-sm"
                value={dealerAreaId}
                onChange={(e) => setDealerAreaId(e.target.value)}
              >
                <option value="">—</option>
                {options.dealerAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Mode of payment</Label>
              <select
                className="flex h-9 rounded-md border bg-background px-2 text-sm"
                value={modeOfPaymentId}
                onChange={(e) => setModeOfPaymentId(e.target.value)}
              >
                <option value="">—</option>
                {options.modes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}
        <Button className="self-end" disabled={pending || !name} onClick={createDealer}>
          <Plus className="size-4" />
          Add dealer
        </Button>
      </div>

      <AppDataTable
        shellHeader={
          <TableSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search dealers…"
            suggestions={suggestions}
            className="sm:max-w-sm"
          />
        }
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Name</TableHead>
                <TableHead>SAP</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Branches</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={COL_COUNT} message={emptyMessage} />
              ) : (
                filtered.map((row, index) => (
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
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={row.status}
                        disabled={pending}
                        onChange={(e) => {
                          startTransition(async () => {
                            const result = await updateDealerAction({
                              dealerId: row.id,
                              name: row.name,
                              status: e.target.value as "active" | "inactive",
                            });
                            if (result.error) toast.error(String(result.error));
                            else router.refresh();
                          });
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </TableCell>
                    <TableRowActions onDelete={() => setDeleting(row)} />
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </AppDataTableBody>
      </AppDataTable>

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
