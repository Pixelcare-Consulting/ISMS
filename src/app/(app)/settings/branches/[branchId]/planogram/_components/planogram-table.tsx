"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  addPlanogramModelAction,
  listActiveModelsForPlanogramAction,
  removePlanogramModelAction,
  updatePlanogramMaxQtyAction,
  updatePlanogramMilAction,
} from "@/features/planogram/actions/planogram.actions";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { Badge } from "@/components/ui/badge";
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

interface PlanogramRow {
  id: string;
  maxQty: number;
  stockCount: number;
  daysThreshold: number | null;
  model: {
    id: string;
    skuCode: string;
    name: string;
    status: string;
    brand: { name: string } | null;
  };
}

export function PlanogramTable({
  branchId,
  rows,
  canManage,
}: {
  branchId: string;
  rows: PlanogramRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

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

  return (
    <div className="space-y-4">
      <DataTableShell>
        {canManage ? (
          <div className="flex items-center justify-end border-b px-4 py-3">
            <Button onClick={() => setShowAdd(true)}>Add model</Button>
          </div>
        ) : null}
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Stock / Max</TableHead>
                <TableHead title="Minimum inventory life — alert when oldest stock exceeds this age">
                  MIL (days)
                </TableHead>
                {canManage ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <PlanogramRowEditor
                  key={row.id}
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
  branchId,
  row,
  canManage,
  pending,
  onRemove,
  onSaved,
}: {
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
    <TableRow>
      <TableCell className="font-mono text-sm">{row.model.skuCode}</TableCell>
      <TableCell>{row.model.name}</TableCell>
      <TableCell>{row.model.brand?.name ?? "—"}</TableCell>
      <TableCell>
        <span className={belowCapacity ? "text-amber-600 font-medium" : ""}>
          {row.stockCount} / {canManage ? (
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
