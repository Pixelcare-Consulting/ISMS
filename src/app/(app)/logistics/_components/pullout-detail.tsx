"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approvePulloutTlAction,
  listPulloutSerialsAction,
  listWarehousesForLogisticsAction,
  rejectPulloutAction,
  releasePulloutAction,
  updatePulloutListAction,
} from "@/features/logistics/actions/logistics.actions";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";

function historyLabel(action: string): string {
  switch (action) {
    case "pullout.created":
      return "Request submitted";
    case "pullout.approved":
      return "Approved by Team Lead";
    case "pullout.rejected":
      return "Rejected";
    case "pullout.list_saved":
      return "Logistics list saved";
    case "pullout.finalized":
      return "Sent — in transit";
    default:
      return action;
  }
}

function inScope(scope: string[] | null, branchId: string): boolean {
  return scope === null || scope.includes(branchId);
}

export function PulloutDetailView({
  detail,
  capabilities,
  branchScope,
}: {
  detail: PulloutDetail;
  capabilities: LogisticsActionCapabilities;
  branchScope: string[] | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canEditList =
    (detail.status.code === "for_pullout" || detail.status.code === "pending_logistics") &&
    capabilities.canManage &&
    inScope(branchScope, detail.branch.id);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]);
  const [extraSerials, setExtraSerials] = useState<
    { serialNumberId: string; serialNo: string; skuCode: string; inventoryCode: string }[]
  >([]);
  const [warehouseId, setWarehouseId] = useState(detail.warehouse.id);
  const [waybillNo, setWaybillNo] = useState(detail.waybillNo ?? "");
  const [notes, setNotes] = useState(detail.notes ?? "");
  const [selected, setSelected] = useState<string[]>(detail.lines.map((line) => line.serialNumberId));

  useEffect(() => {
    if (!canEditList) return;
    let cancelled = false;
    void Promise.all([
      listWarehousesForLogisticsAction(),
      listPulloutSerialsAction(detail.branch.id),
    ]).then(([warehouseRows, serialResult]) => {
      if (cancelled) return;
      setWarehouses(warehouseRows);
      if ("serials" in serialResult) setExtraSerials(serialResult.serials);
    });
    return () => {
      cancelled = true;
    };
  }, [canEditList, detail.branch.id]);

  function run(
    action: () => Promise<
      { error: string } | { success: true; sapJob?: { message: string } }
    >,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("sapJob" in result && result.sapJob ? result.sapJob.message : success);
      router.refresh();
    });
  }

  const selectable = [
    ...detail.lines.map((line) => ({
      serialNumberId: line.serialNumberId,
      serialNo: line.serialNo,
      skuCode: line.skuCode,
      inventoryCode: line.inventoryCode ?? line.priorCode ?? "",
    })),
    ...extraSerials.filter(
      (serial) => !detail.lines.some((line) => line.serialNumberId === serial.serialNumberId),
    ),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/logistics/pickups" className="text-sm text-muted-foreground hover:underline">
            Back to pull-outs
          </Link>
          <h2 className="text-xl font-semibold">{detail.pulloutNo}</h2>
        </div>
        <StatusCodeBadge
          code={detail.status.code}
          name={detail.status.name}
          color={detail.status.color}
        />
      </div>

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Warehouse receipt is not available yet. After this pull-out is sent, the units stay in
        transit at {detail.branch.name}.
      </p>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">Branch</dt>
          <dd>{detail.branch.name}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Warehouse</dt>
          <dd>
            {detail.warehouse.name} ({detail.warehouse.code})
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Reason</dt>
          <dd>{detail.reason ? `${detail.reason.name} (${detail.reason.code})` : "—"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Waybill</dt>
          <dd>{detail.waybillNo || "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-muted-foreground">Notes</dt>
          <dd>{detail.notes || "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-muted-foreground">SAP request</dt>
          <dd>{detail.sapJob?.message ?? "No SAP request has been queued for this pull-out."}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Serial</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Held as</th>
              <th className="px-3 py-2 font-medium">Now</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((line) => (
              <tr key={line.serialNumberId} className="border-t">
                <td className="px-3 py-2 font-mono">{line.serialNo}</td>
                <td className="px-3 py-2">
                  {line.skuCode} — {line.modelName}
                </td>
                <td className="px-3 py-2">{line.priorCode ?? "—"}</td>
                <td className="px-3 py-2">{line.inventoryCode ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail.status.code === "pending_tl" && capabilities.canApproveTl ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => run(() => approvePulloutTlAction(detail.id), "Pull-out approved")}
          >
            TL approve
          </Button>
          {capabilities.canRejectTransfer ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => rejectPulloutAction(detail.id), "Pull-out rejected")}
            >
              Reject
            </Button>
          ) : null}
        </div>
      ) : null}

      {canEditList ? (
        <form
          className="space-y-3 rounded-md border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                updatePulloutListAction(detail.id, {
                  warehouseId,
                  waybillNo,
                  notes,
                  serialNumberIds: selected,
                }),
              "Pull-out list saved",
            );
          }}
        >
          <h3 className="font-medium">Logistics list</h3>
          <SearchableSelect
            label="Warehouse"
            options={(warehouses.length > 0 ? warehouses : [detail.warehouse]).map((warehouse) => ({
              id: warehouse.id,
              label: `${warehouse.name} (${warehouse.code})`,
            }))}
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder="Select warehouse…"
            searchPlaceholder="Search warehouses…"
            disabled={pending}
          />
          <div className="space-y-1">
            <Label htmlFor="pullout-waybill">Waybill</Label>
            <Input
              id="pullout-waybill"
              value={waybillNo}
              disabled={pending}
              onChange={(event) => setWaybillNo(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pullout-notes">Notes</Label>
            <Textarea
              id="pullout-notes"
              value={notes}
              disabled={pending}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {selectable.map((serial) => (
              <label
                key={serial.serialNumberId}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={selected.includes(serial.serialNumberId)}
                  onCheckedChange={(value) => {
                    setSelected((current) =>
                      value === true
                        ? [...current, serial.serialNumberId]
                        : current.filter((id) => id !== serial.serialNumberId),
                    );
                  }}
                  aria-label={`Keep ${serial.serialNo}`}
                />
                <span className="font-mono">{serial.serialNo}</span>
                <span className="text-muted-foreground">
                  {serial.skuCode} · {serial.inventoryCode}
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || selected.length === 0}>
              Save list
            </Button>
            {detail.status.code === "pending_logistics" ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => releasePulloutAction(detail.id),
                    "Pull-out is in transit",
                  )
                }
              >
                Send pull-out
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      <section className="space-y-2">
        <h3 className="font-medium">History</h3>
        {detail.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {detail.history.map((row) => (
              <li key={row.id}>
                {historyLabel(row.action)}
                {row.userName ? ` · ${row.userName}` : ""} · {new Date(row.at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
