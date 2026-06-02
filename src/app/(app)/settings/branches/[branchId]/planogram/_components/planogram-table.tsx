"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  addPlanogramModelAction,
  importPlanogramCsvForBranchAction,
  listActiveModelsForPlanogramAction,
  removePlanogramModelAction,
  updatePlanogramMaxQtyAction,
  updatePlanogramMilAction,
} from "@/features/planogram/actions/planogram.actions";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

interface PlanogramRow {
  id: string;
  maxQty: number;
  effectiveFrom?: string | null;
  stockCount: number;
  ditCount: number;
  daysThreshold: number | null;
  model: {
    id: string;
    skuCode: string;
    name: string;
    status: string;
    srp: number | null;
    series: string | null;
    brand: { name: string } | null;
  };
}

function formatPeso(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PlanogramTable({
  branchId,
  rows,
  canManage,
  offPlanogramSerialCount = 0,
}: {
  branchId: string;
  rows: PlanogramRow[];
  canManage: boolean;
  offPlanogramSerialCount?: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const selection = useTableSelection(rows.map((row) => row.id));

  function handleRemove(planogramId: string) {
    startTransition(async () => {
      const result = await removePlanogramModelAction(planogramId, branchId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Model removed from planogram");
      router.refresh();
    });
  }

  function handleImport(formData: FormData) {
    startTransition(async () => {
      const result = await importPlanogramCsvForBranchAction(branchId, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Planogram imported (${result.skuCount ?? 0} SKUs)`);
      router.refresh();
    });
  }

  function importBundledCsv() {
    startTransition(async () => {
      const result = await importPlanogramCsvForBranchAction(branchId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Planogram synced from BRS CSV (${result.skuCount ?? 0} SKUs)`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {offPlanogramSerialCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {offPlanogramSerialCount} inventory unit
          {offPlanogramSerialCount === 1 ? "" : "s"} at this branch{" "}
          {offPlanogramSerialCount === 1 ? "is" : "are"} off-planogram.{" "}
          <Link href={`/inventory?branch=${branchId}&offPlanogram=1`} className="underline">
            View units
          </Link>
        </div>
      ) : null}

      <DataTableShell>
        {canManage ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.set("file", file);
                handleImport(fd);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 size-4" />
              Import CSV
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={importBundledCsv}>
              Sync BRS CSV
            </Button>
            <Button onClick={() => setShowAdd(true)}>Add model</Button>
          </div>
        ) : null}
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all planogram rows"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Series</TableHead>
                <TableHead>SRP</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Stock / Max</TableHead>
                <TableHead title="Minimum inventory life — alert when oldest stock exceeds this age">
                  MIL (days)
                </TableHead>
                <TableHead className="w-28">Units</TableHead>
                {canManage ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <PlanogramRowEditor
                  key={row.id}
                  index={index}
                  selected={selection.isRowSelected(row.id)}
                  onSelect={(checked) => selection.toggleRow(row.id, checked)}
                  branchId={branchId}
                  row={row}
                  canManage={canManage}
                  pending={pending}
                  onRemove={() => handleRemove(row.id)}
                  onSaved={() => router.refresh()}
                />
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>
      {showAdd ? (
        <AddPlanogramDialog
          branchId={branchId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function PlanogramRowEditor({
  index,
  selected,
  onSelect,
  branchId,
  row,
  canManage,
  pending,
  onRemove,
  onSaved,
}: {
  index: number;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  branchId: string;
  row: PlanogramRow;
  canManage: boolean;
  pending: boolean;
  onRemove: () => void;
  onSaved: () => void;
}) {
  const [maxQty, setMaxQty] = useState(row.maxQty);
  const [milDays, setMilDays] = useState(row.daysThreshold ?? 30);
  const [saving, startTransition] = useTransition();

  const belowCapacity = row.stockCount < row.maxQty;
  const inventoryHref = `/inventory?branch=${branchId}&sku=${encodeURIComponent(row.model.skuCode)}`;

  function saveMaxQty() {
    if (maxQty === row.maxQty) return;
    startTransition(async () => {
      const result = await updatePlanogramMaxQtyAction({
        planogramId: row.id,
        branchId,
        maxQty,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Max qty updated");
      onSaved();
    });
  }

  function saveMil() {
    if (milDays === row.daysThreshold) return;
    startTransition(async () => {
      const result = await updatePlanogramMilAction({
        branchId,
        modelId: row.model.id,
        daysThreshold: milDays,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("MIL threshold updated");
      onSaved();
    });
  }

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={`Select planogram row ${row.model.skuCode}`}
        />
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="font-mono text-sm">{row.model.skuCode}</TableCell>
      <TableCell>{row.model.name}</TableCell>
      <TableCell>{row.model.series ?? "—"}</TableCell>
      <TableCell className="tabular-nums">{formatPeso(row.model.srp)}</TableCell>
      <TableCell>{row.model.brand?.name ?? "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.effectiveFrom ?? "—"}
      </TableCell>
      <TableCell>
        <span className={belowCapacity ? "font-medium text-amber-600" : ""}>
          STK {row.stockCount} · DIT {row.ditCount} / max{" "}
          {canManage ? (
            <Input
              type="number"
              min={1}
              className="inline-block h-8 w-16 px-1 text-sm"
              value={maxQty}
              onChange={(e) => setMaxQty(Number(e.target.value))}
              onBlur={saveMaxQty}
              disabled={saving || pending}
            />
          ) : (
            row.maxQty
          )}
        </span>
        {belowCapacity ? (
          <Badge variant="outline" className="ml-2 text-amber-600">
            below cap
          </Badge>
        ) : null}
      </TableCell>
      <TableCell>
        {canManage ? (
          <Input
            type="number"
            min={1}
            className="h-8 w-20"
            value={milDays}
            onChange={(e) => setMilDays(Number(e.target.value))}
            onBlur={saveMil}
            disabled={saving || pending}
          />
        ) : (
          (row.daysThreshold ?? "—")
        )}
      </TableCell>
      <TableCell>
        <Button variant="link" size="sm" className="h-auto p-0" asChild>
          <Link href={inventoryHref}>View units</Link>
        </Button>
      </TableCell>
      {canManage ? (
        <TableCell>
          <Button variant="ghost" size="icon" disabled={pending} onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function AddPlanogramDialog({
  branchId,
  onClose,
  onAdded,
}: {
  branchId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [models, setModels] = useState<
    { id: string; skuCode: string; name: string }[]
  >([]);
  const [modelId, setModelId] = useState("");
  const [maxQty, setMaxQty] = useState(5);
  const [daysThreshold, setDaysThreshold] = useState(30);

  async function loadModels() {
    const list = await listActiveModelsForPlanogramAction(branchId);
    setModels(list.map((m) => ({ id: m.id, skuCode: m.skuCode, name: m.name })));
    if (list[0]) setModelId(list[0].id);
  }

  function submit() {
    startTransition(async () => {
      const result = await addPlanogramModelAction({
        branchId,
        modelId,
        maxQty,
        daysThreshold,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Model added to planogram");
      onAdded();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg">
        <h3 className="font-medium">Add model to planogram</h3>
        {models.length === 0 ? (
          <Button variant="outline" type="button" onClick={loadModels}>
            Load active SKUs
          </Button>
        ) : (
          <>
            <div>
              <Label>Model</Label>
              <select
                className="flex h-9 w-full rounded-md border px-2 text-sm"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.skuCode} — {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Max qty</Label>
              <Input
                type="number"
                min={1}
                value={maxQty}
                onChange={(e) => setMaxQty(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>MIL days threshold</Label>
              <Input
                type="number"
                min={1}
                value={daysThreshold}
                onChange={(e) => setDaysThreshold(Number(e.target.value))}
              />
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || !modelId} onClick={submit}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
