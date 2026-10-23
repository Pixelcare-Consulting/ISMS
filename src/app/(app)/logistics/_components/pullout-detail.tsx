"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { PulloutTracker } from "@/app/(app)/logistics/_components/pullout-tracker";
import { uniqueSearchSuggestions, useClientTablePagination } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import {
  approvePulloutTlAction,
  listPulloutSerialsAction,
  listWarehousesForLogisticsAction,
  rejectPulloutAction,
  releasePulloutAction,
  updatePulloutListAction,
} from "@/features/logistics/actions/logistics.actions";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

/** One warehouse-receipt notice per pull-out for this page load. Refocus does not show it again. */
const warehouseReceiptNotified = new Set<string>();

type RequestCondition = "STK" | "DEF" | "Mixed";
type HoldCode = "RSV" | "FPO" | "DEF" | "DIT";

interface ItemRow {
  serialNumberId: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  priorCode: string | null;
  inventoryCode: string | null;
  classificationNames: string[];
  unitPackingConditionNames: string[];
  accessoryCompletenessNames: string[];
}

interface ExtraSerial {
  serialNumberId: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  inventoryCode: string;
}

const MANILA_DATE = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "Asia/Manila",
});

const MANILA_DATE_TIME = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

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

function formatWhen(value: string | null | undefined, withTime: boolean): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (withTime ? MANILA_DATE_TIME : MANILA_DATE).format(date);
}

function joinedLabel(name: string, code: string): string | null {
  const trimmedName = name.trim();
  const trimmedCode = code.trim();
  if (trimmedName && trimmedCode) return `${trimmedName} (${trimmedCode})`;
  return trimmedName || trimmedCode || null;
}

function requestCondition(lines: { priorCode: string | null }[]): RequestCondition | null {
  let stock = false;
  let defective = false;
  for (const line of lines) {
    switch (line.priorCode) {
      case "STK":
        stock = true;
        break;
      case "DEF":
        defective = true;
        break;
      default:
        break;
    }
  }
  if (stock && defective) return "Mixed";
  if (stock) return "STK";
  if (defective) return "DEF";
  return null;
}

function asHoldCode(code: string | null): HoldCode | null {
  switch (code) {
    case "RSV":
    case "FPO":
    case "DEF":
    case "DIT":
      return code;
    default:
      return null;
  }
}

function asPriorCode(code: string | null): "STK" | "DEF" | null {
  switch (code) {
    case "STK":
    case "DEF":
      return code;
    default:
      return null;
  }
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function textOrDash(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return <Dash />;
  return trimmed;
}

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-sm text-muted-foreground">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function RequestConditionBadge({ condition }: { condition: RequestCondition }) {
  switch (condition) {
    case "STK":
      return <StatusCodeBadge code="STK" name="STK" />;
    case "DEF":
      return <StatusCodeBadge code="DEF" name="DEF" />;
    case "Mixed":
      return (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-normal text-slate-700">
          Mixed
        </span>
      );
    default: {
      const unreachable: never = condition;
      return unreachable;
    }
  }
}

function ModelSummary({ skuCode, name }: { skuCode: string; name: string }) {
  const title = name ? `${skuCode} — ${name}` : skuCode;
  return (
    <div className="w-56 max-w-full min-w-0" title={title}>
      <p className="truncate">{skuCode}</p>
      {name ? <p className="truncate text-xs text-muted-foreground">{name}</p> : null}
    </div>
  );
}

function NotRecorded() {
  return <span className="text-muted-foreground">Not recorded</span>;
}

function recordedNames(names: readonly string[]) {
  if (names.length === 0) return <NotRecorded />;
  return (
    <ul className="space-y-0.5">
      {names.map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  );
}

const pulloutItemColumn = createColumnHelper<DataTableFeatures, ItemRow>();

function stopSearchSubmit(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
    event.preventDefault();
  }
}

function PulloutItemsTable({
  rows,
  canEditList,
  pending,
  selected,
  onToggle,
}: {
  rows: ItemRow[];
  canEditList: boolean;
  pending: boolean;
  selected: string[];
  onToggle: (serialNumberId: string, on: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.skuCode,
          row.modelName,
          row.serialNo,
          row.priorCode,
          row.inventoryCode,
          ...row.classificationNames,
          ...row.unitPackingConditionNames,
          ...row.accessoryCompletenessNames,
        ]),
      ),
    [query, rows],
  );
  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.serialNo),
        rows.map((row) => row.skuCode),
        rows.map((row) => row.modelName),
        rows.flatMap((row) => row.classificationNames),
        rows.flatMap((row) => row.unitPackingConditionNames),
        rows.flatMap((row) => row.accessoryCompletenessNames),
      ),
    [rows],
  );
  const { page, setPage, pageSize, setPageSize, total, totalPages, pageItems, indexOffset } =
    useClientTablePagination(filtered, { resetKey: query });

  const columns = useMemo(() => {
    const cols: DataTableColumn<ItemRow>[] = [
      pulloutItemColumn.display({
        id: "index",
        header: "#",
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
    ];
    if (canEditList) {
      cols.push(
        pulloutItemColumn.display({
          id: "include",
          header: () => <span className="sr-only">Include</span>,
          cell: ({ row }) => (
            <Checkbox
              checked={selected.includes(row.original.serialNumberId)}
              onCheckedChange={(value) => onToggle(row.original.serialNumberId, value === true)}
              disabled={pending}
              aria-label={`Keep ${row.original.serialNo}`}
            />
          ),
          meta: { className: "w-12" },
        }),
      );
    }
    cols.push(
      pulloutItemColumn.display({
        id: "model",
        header: "Model",
        cell: ({ row }) => (
          <ModelSummary skuCode={row.original.skuCode} name={row.original.modelName} />
        ),
      }),
      pulloutItemColumn.display({
        id: "serial",
        header: "Serial number",
        cell: ({ row }) => row.original.serialNo,
        meta: { className: "font-mono" },
      }),
      pulloutItemColumn.display({
        id: "condition",
        header: "Inventory condition",
        cell: ({ row }) => {
          const prior = asPriorCode(row.original.priorCode);
          return prior ? <StatusCodeBadge code={prior} name={prior} /> : <Dash />;
        },
      }),
      pulloutItemColumn.display({
        id: "classification",
        header: "Classification",
        cell: ({ row }) => recordedNames(row.original.classificationNames),
      }),
      pulloutItemColumn.display({
        id: "packing",
        header: "Unit packing condition",
        cell: ({ row }) => recordedNames(row.original.unitPackingConditionNames),
      }),
      pulloutItemColumn.display({
        id: "accessories",
        header: "Accessory completeness",
        cell: ({ row }) => recordedNames(row.original.accessoryCompletenessNames),
      }),
      pulloutItemColumn.display({
        id: "hold",
        header: "Current hold",
        cell: ({ row }) => {
          const hold = asHoldCode(row.original.inventoryCode);
          return hold ? <StatusCodeBadge code={hold} name={hold} /> : <Dash />;
        },
      }),
    );
    return cols;
  }, [canEditList, indexOffset, onToggle, pending, selected]);

  return (
    <div onKeyDown={stopSearchSubmit}>
      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.serialNumberId}
        manualPagination
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search serials…",
          suggestions,
        }}
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "item",
          onPageChange: setPage,
        }}
        empty={pageItems.length === 0}
        emptyMessage={rows.length === 0 ? "No serials on this pull-out." : "No matching serials."}
      />
    </div>
  );
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
  const [extraSerials, setExtraSerials] = useState<ExtraSerial[]>([]);
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
      if ("serials" in serialResult) {
        setExtraSerials(
          serialResult.serials.map((serial) => ({
            serialNumberId: serial.serialNumberId,
            serialNo: serial.serialNo,
            skuCode: serial.skuCode,
            modelName: serial.modelName,
            inventoryCode: serial.inventoryCode,
          })),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canEditList, detail.branch.id]);

  useEffect(() => {
    if (warehouseReceiptNotified.has(detail.id)) return;
    warehouseReceiptNotified.add(detail.id);
    toast.message(
      `Warehouse receipt is not available yet. After this pull-out is sent, the units stay in transit at ${detail.branch.name}.`,
      { id: `pullout-warehouse-receipt:${detail.id}` },
    );
  }, [detail.branch.name, detail.id]);

  function run(
    action: () => Promise<{ error: string } | { success: true; sapJob?: { message: string } }>,
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

  const rows: ItemRow[] = [
    ...detail.lines.map((line) => ({
      serialNumberId: line.serialNumberId,
      serialNo: line.serialNo,
      skuCode: line.skuCode,
      modelName: line.modelName,
      priorCode: line.priorCode,
      inventoryCode: line.inventoryCode,
      classificationNames: line.classificationNames,
      unitPackingConditionNames: line.unitPackingConditionNames,
      accessoryCompletenessNames: line.accessoryCompletenessNames,
    })),
    ...(canEditList
      ? extraSerials
          .filter((serial) => !detail.lines.some((line) => line.serialNumberId === serial.serialNumberId))
          .map((serial) => ({
            serialNumberId: serial.serialNumberId,
            serialNo: serial.serialNo,
            skuCode: serial.skuCode,
            modelName: serial.modelName,
            priorCode: asPriorCode(serial.inventoryCode),
            inventoryCode: serial.inventoryCode,
            classificationNames: [],
            unitPackingConditionNames: [],
            accessoryCompletenessNames: [],
          }))
      : []),
  ];

  const condition = requestCondition(detail.lines);
  const showApprove = detail.status.code === "pending_tl" && capabilities.canApproveTl;
  const showReject = showApprove && capabilities.canRejectTransfer;
  const showSend = canEditList && detail.status.code === "pending_logistics";
  const warehouseChoices = warehouses.length > 0 ? warehouses : [detail.warehouse];
  const locationLabel = detail.warehouseLocation
    ? joinedLabel(detail.warehouseLocation.name, detail.warehouseLocation.code)
    : null;

  function saveList() {
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
  }

  const logistics = (
    <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="font-medium">Logistics</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Waybill" htmlFor={canEditList ? "pullout-waybill" : undefined}>
          {canEditList ? (
            <Input
              id="pullout-waybill"
              value={waybillNo}
              disabled={pending}
              onChange={(event) => setWaybillNo(event.target.value)}
            />
          ) : (
            textOrDash(detail.waybillNo)
          )}
        </Field>
        <Field label="Scheduled by">{textOrDash(detail.scheduledByName)}</Field>
        <Field label="Scheduled date and time">{textOrDash(formatWhen(detail.scheduledAt, true))}</Field>
        <Field label="Actual pull-out date">
          {textOrDash(formatWhen(detail.actualScheduledDate, false))}
        </Field>
        <Field
          label="Destination warehouse"
          htmlFor={canEditList ? "pullout-warehouse" : undefined}
        >
          {canEditList ? (
            <SearchableSelect
              id="pullout-warehouse"
              options={warehouseChoices.map((warehouse) => ({
                id: warehouse.id,
                label: joinedLabel(warehouse.name, warehouse.code) ?? warehouse.name,
              }))}
              value={warehouseId}
              onChange={setWarehouseId}
              placeholder="Select warehouse…"
              searchPlaceholder="Search warehouses…"
              disabled={pending}
            />
          ) : (
            textOrDash(joinedLabel(detail.warehouse.name, detail.warehouse.code))
          )}
        </Field>
        <Field label="Warehouse location">{textOrDash(locationLabel)}</Field>
      </dl>
    </section>
  );

  const items = (
    <section className="space-y-2">
      <h3 className="font-medium">Items</h3>
      <PulloutItemsTable
        rows={rows}
        canEditList={canEditList}
        pending={pending}
        selected={selected}
        onToggle={(serialNumberId, on) => {
          setSelected((current) =>
            on
              ? current.includes(serialNumberId)
                ? current
                : [...current, serialNumberId]
              : current.filter((id) => id !== serialNumberId),
          );
        }}
      />
      <div className="space-y-1.5">
        <label htmlFor="pullout-remarks" className="text-sm text-muted-foreground">
          Remarks
        </label>
        {canEditList ? (
          <Textarea
            id="pullout-remarks"
            value={notes}
            disabled={pending}
            onChange={(event) => setNotes(event.target.value)}
          />
        ) : (
          <p id="pullout-remarks" className="text-sm whitespace-pre-wrap">
            {detail.notes?.trim() ? detail.notes : <Dash />}
          </p>
        )}
      </div>
      {canEditList ? (
        <Button type="submit" disabled={pending || selected.length === 0}>
          Save list
        </Button>
      ) : null}
    </section>
  );

  const details = (
    <>
      {logistics}
      {items}
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/logistics/pickups" className="text-sm text-muted-foreground hover:underline">
          Back to pull-outs
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-semibold">{detail.pulloutNo}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Inventory condition</span>
                {condition ? <RequestConditionBadge condition={condition} /> : <Dash />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status</span>
                <StatusCodeBadge
                  code={detail.status.code}
                  name={detail.status.name}
                  color={detail.status.color}
                />
              </div>
            </div>
          </div>
          {showApprove || showSend ? (
            <div className="flex flex-wrap gap-2">
              {showApprove ? (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => approvePulloutTlAction(detail.id), "Pull-out approved")}
                >
                  Approve
                </Button>
              ) : null}
              {showReject ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => rejectPulloutAction(detail.id), "Pull-out rejected")}
                >
                  Reject
                </Button>
              ) : null}
              {showSend ? (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => releasePulloutAction(detail.id), "Pull-out is in transit")}
                >
                  Send
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <PulloutTracker status={detail.status} createdAt={detail.createdAt} history={detail.history} />
      </div>

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="font-medium">Requestor</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Branch">{textOrDash(detail.branch.name)}</Field>
          <Field label="Created by">{textOrDash(detail.createdByName)}</Field>
          <Field label="Created date">{textOrDash(formatWhen(detail.createdAt, false))}</Field>
          <Field label="Attachments">No attachments</Field>
          <Field label="Reason">
            {detail.reason ? (
              <StatusCodeBadge
                code={detail.reason.code}
                name={detail.reason.name}
                color={detail.reason.color}
              />
            ) : (
              <Dash />
            )}
          </Field>
        </dl>
      </section>

      {canEditList ? (
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            saveList();
          }}
        >
          {details}
        </form>
      ) : (
        details
      )}

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
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

      <p className="text-sm text-muted-foreground">
        {detail.sapJob?.message ?? "No SAP request has been queued for this pull-out."}
      </p>
    </div>
  );
}
