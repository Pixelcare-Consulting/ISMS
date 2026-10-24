"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  LogisticsDocumentHeader,
  LogisticsDoneLine,
  LogisticsHistoryCard,
  LogisticsProgressCard,
  LogisticsStepWorkspace,
  LogisticsTableHeading,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import {
  finishedPulloutSteps,
  PulloutTracker,
} from "@/app/(app)/logistics/_components/pullout-tracker";
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
  inventoryCode: "STK" | "DEF";
}

type ExtraSerialLoad = "idle" | "loading" | "ready" | "error";

type PulloutOpenKind =
  | "pending_tl"
  | "for_pullout"
  | "pending_logistics"
  | "in_transit"
  | "other";

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
      <dt className="text-xs text-muted-foreground">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
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
  title = "Units on this pull-out",
  itemLabel = "unit",
  toolbarActions,
}: {
  rows: ItemRow[];
  canEditList: boolean;
  pending: boolean;
  selected: string[];
  onToggle: (serialNumberId: string, on: boolean) => void;
  title?: string;
  itemLabel?: string;
  toolbarActions?: ReactNode;
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
        toolbarLeading={
          <LogisticsTableHeading title={title} count={rows.length} itemLabel={itemLabel} />
        }
        toolbarActions={toolbarActions}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel,
          onPageChange: setPage,
        }}
        empty={pageItems.length === 0}
        emptyMessage={rows.length === 0 ? "No serials on this pull-out." : "No matching serials."}
      />
    </div>
  );
}

const NO_SELECTION: string[] = [];

function readOnlyToggle() {}

function pulloutOpenKind(code: string): PulloutOpenKind {
  switch (code) {
    case "pending_tl":
    case "for_pullout":
    case "pending_logistics":
    case "in_transit":
      return code;
    default:
      return "other";
  }
}

function doneLineDetail(at: string | null, actor: string | null): string | undefined {
  const when = formatWhen(at, true);
  if (actor && when) return `${actor} · ${when}`;
  return when ?? actor ?? undefined;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const ids = new Set(right);
  return left.every((id) => ids.has(id));
}

function savedItemRows(lines: PulloutDetail["lines"]): ItemRow[] {
  return lines.map((line) => ({
    serialNumberId: line.serialNumberId,
    serialNo: line.serialNo,
    skuCode: line.skuCode,
    modelName: line.modelName,
    priorCode: line.priorCode,
    inventoryCode: line.inventoryCode,
    classificationNames: line.classificationNames,
    unitPackingConditionNames: line.unitPackingConditionNames,
    accessoryCompletenessNames: line.accessoryCompletenessNames,
  }));
}

function recordedSchedule(detail: PulloutDetail): { label: string; value: string }[] {
  const scheduledBy = detail.scheduledByName?.trim() ?? "";
  const scheduledAt = formatWhen(detail.scheduledAt, true);
  const actualDate = formatWhen(detail.actualScheduledDate, false);
  const location = detail.warehouseLocation
    ? joinedLabel(detail.warehouseLocation.name, detail.warehouseLocation.code)
    : null;
  const fields: { label: string; value: string }[] = [];
  if (scheduledBy) fields.push({ label: "Scheduled by", value: scheduledBy });
  if (scheduledAt) fields.push({ label: "Scheduled date and time", value: scheduledAt });
  if (actualDate) fields.push({ label: "Actual pull-out date", value: actualDate });
  if (location) fields.push({ label: "Warehouse location", value: location });
  return fields;
}

function ScheduleFields({ detail }: { detail: PulloutDetail }) {
  return recordedSchedule(detail).map((field) => (
    <Field key={field.label} label={field.label}>
      {field.value}
    </Field>
  ));
}

function ReasonValue({ reason }: { reason: PulloutDetail["reason"] }) {
  if (!reason) return <Dash />;
  return <StatusCodeBadge code={reason.code} name={reason.name} color={reason.color} />;
}

function PulloutListFields({
  detail,
  canEdit,
  pending,
  waybillNo,
  warehouseId,
  notes,
  warehouses,
  onWaybillNo,
  onWarehouseId,
  onNotes,
}: {
  detail: PulloutDetail;
  canEdit: boolean;
  pending: boolean;
  waybillNo: string;
  warehouseId: string;
  notes: string;
  warehouses: { id: string; name: string; code: string }[];
  onWaybillNo: (value: string) => void;
  onWarehouseId: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  const warehouseChoices = warehouses.length > 0 ? warehouses : [detail.warehouse];
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <Field label="Destination warehouse" htmlFor={canEdit ? "pullout-warehouse" : undefined}>
        {canEdit ? (
          <SearchableSelect
            id="pullout-warehouse"
            options={warehouseChoices.map((warehouse) => ({
              id: warehouse.id,
              label: joinedLabel(warehouse.name, warehouse.code) ?? warehouse.name,
            }))}
            value={warehouseId}
            onChange={onWarehouseId}
            placeholder="Select warehouse…"
            searchPlaceholder="Search warehouses…"
            disabled={pending}
          />
        ) : (
          textOrDash(joinedLabel(detail.warehouse.name, detail.warehouse.code))
        )}
      </Field>
      <Field label="Waybill" htmlFor={canEdit ? "pullout-waybill" : undefined}>
        {canEdit ? (
          <Input
            id="pullout-waybill"
            value={waybillNo}
            disabled={pending}
            onChange={(event) => onWaybillNo(event.target.value)}
          />
        ) : (
          textOrDash(detail.waybillNo)
        )}
      </Field>
      <ScheduleFields detail={detail} />
      <Field label="Remarks" htmlFor={canEdit ? "pullout-remarks" : undefined} className="sm:col-span-2">
        {canEdit ? (
          <Textarea
            id="pullout-remarks"
            value={notes}
            disabled={pending}
            onChange={(event) => onNotes(event.target.value)}
          />
        ) : (
          <p className="font-normal whitespace-pre-wrap">
            {detail.notes?.trim() ? (
              detail.notes
            ) : (
              <span className="text-muted-foreground">No remarks recorded.</span>
            )}
          </p>
        )}
      </Field>
    </dl>
  );
}

const extraSerialColumn = createColumnHelper<DataTableFeatures, ExtraSerial>();

function ExtraSerialsTable({
  rows,
  pending,
  selected,
  onToggle,
}: {
  rows: ExtraSerial[];
  pending: boolean;
  selected: string[];
  onToggle: (serialNumberId: string, on: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [row.skuCode, row.modelName, row.serialNo, row.inventoryCode]),
      ),
    [query, rows],
  );
  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.serialNo),
        rows.map((row) => row.skuCode),
        rows.map((row) => row.modelName),
      ),
    [rows],
  );
  const { page, setPage, pageSize, setPageSize, total, totalPages, pageItems, indexOffset } =
    useClientTablePagination(filtered, { resetKey: query });
  const columns = useMemo(() => {
    const cols: DataTableColumn<ExtraSerial>[] = [
      extraSerialColumn.display({
        id: "index",
        header: "#",
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      extraSerialColumn.display({
        id: "include",
        header: () => <span className="sr-only">Add</span>,
        cell: ({ row }) => (
          <Checkbox
            checked={selected.includes(row.original.serialNumberId)}
            onCheckedChange={(value) => onToggle(row.original.serialNumberId, value === true)}
            disabled={pending}
            aria-label={`Add ${row.original.serialNo}`}
          />
        ),
        meta: { className: "w-12" },
      }),
      extraSerialColumn.display({
        id: "model",
        header: "Model",
        cell: ({ row }) => <ModelSummary skuCode={row.original.skuCode} name={row.original.modelName} />,
      }),
      extraSerialColumn.display({
        id: "serial",
        header: "Serial number",
        cell: ({ row }) => row.original.serialNo,
        meta: { className: "font-mono" },
      }),
      extraSerialColumn.display({
        id: "condition",
        header: "Inventory condition",
        cell: ({ row }) => {
          const prior = asPriorCode(row.original.inventoryCode);
          return prior ? <StatusCodeBadge code={prior} name={prior} /> : <Dash />;
        },
      }),
    ];
    return cols;
  }, [indexOffset, onToggle, pending, selected]);

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
        toolbarLeading={
          <LogisticsTableHeading title="Other serials" count={rows.length} itemLabel="serial" />
        }
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "serial",
          onPageChange: setPage,
        }}
        empty={pageItems.length === 0}
        emptyMessage={
          rows.length === 0 ? "No other free serials at this branch." : "No matching serials."
        }
      />
    </div>
  );
}

function AddSerialsPanel({
  state,
  rows,
  pending,
  selected,
  onToggle,
  onRetry,
}: {
  state: ExtraSerialLoad;
  rows: ExtraSerial[];
  pending: boolean;
  selected: string[];
  onToggle: (serialNumberId: string, on: boolean) => void;
  onRetry: () => void;
}) {
  switch (state) {
    case "idle":
    case "loading":
      return <p className="text-sm text-muted-foreground">Loading other serials…</p>;
    case "error":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Other serials could not be loaded.</p>
          <Button type="button" variant="outline" disabled={pending} onClick={onRetry}>
            Try again
          </Button>
        </div>
      );
    case "ready":
      return (
        <ExtraSerialsTable rows={rows} pending={pending} selected={selected} onToggle={onToggle} />
      );
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function ReadOnlyUnits({
  rows,
  title,
  itemLabel,
}: {
  rows: ItemRow[];
  title: string;
  itemLabel: string;
}) {
  return (
    <PulloutItemsTable
      rows={rows}
      canEditList={false}
      pending={false}
      selected={NO_SELECTION}
      onToggle={readOnlyToggle}
      title={title}
      itemLabel={itemLabel}
    />
  );
}

function RecordedPullout({ detail }: { detail: PulloutDetail }) {
  const remarks = detail.notes?.trim() ?? "";
  const waybill = detail.waybillNo?.trim() ?? "";
  const warehouse = joinedLabel(detail.warehouse.name, detail.warehouse.code);
  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field label="Branch">{textOrDash(detail.branch.name)}</Field>
        <Field label="Created by">{textOrDash(detail.createdByName)}</Field>
        <Field label="Reason">
          <ReasonValue reason={detail.reason} />
        </Field>
        <Field label="Destination warehouse">{textOrDash(warehouse)}</Field>
        {waybill ? <Field label="Waybill">{waybill}</Field> : null}
        <ScheduleFields detail={detail} />
        {remarks ? (
          <Field label="Remarks" className="sm:col-span-2">
            <p className="font-normal whitespace-pre-wrap">{remarks}</p>
          </Field>
        ) : null}
      </dl>
      <ReadOnlyUnits rows={savedItemRows(detail.lines)} title="Units on this pull-out" itemLabel="unit" />
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
  const [addOpen, setAddOpen] = useState(false);
  const [extrasState, setExtrasState] = useState<ExtraSerialLoad>("idle");
  const [extrasAttempt, setExtrasAttempt] = useState(0);

  useEffect(() => {
    if (!canEditList) return;
    let cancelled = false;
    void listWarehousesForLogisticsAction().then((warehouseRows) => {
      if (cancelled) return;
      setWarehouses(warehouseRows);
    });
    return () => {
      cancelled = true;
    };
  }, [canEditList]);

  useEffect(() => {
    if (!addOpen || !canEditList) return;
    let cancelled = false;
    setExtrasState("loading");
    void listPulloutSerialsAction(detail.branch.id).then((result) => {
      if (cancelled) return;
      if ("serials" in result) {
        setExtraSerials(
          result.serials.map((serial) => ({
            serialNumberId: serial.serialNumberId,
            serialNo: serial.serialNo,
            skuCode: serial.skuCode,
            modelName: serial.modelName,
            inventoryCode: serial.inventoryCode,
          })),
        );
        setExtrasState("ready");
        return;
      }
      setExtraSerials([]);
      setExtrasState("error");
      toast.error("error" in result && result.error ? result.error : "Failed to load serials");
    });
    return () => {
      cancelled = true;
    };
  }, [addOpen, canEditList, detail.branch.id, extrasAttempt]);

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

  const savedRows = savedItemRows(detail.lines);
  const onPulloutIds = new Set(detail.lines.map((line) => line.serialNumberId));
  const availableSerials = extraSerials.filter((serial) => !onPulloutIds.has(serial.serialNumberId));
  const condition = requestCondition(detail.lines);
  const showApprove = detail.status.code === "pending_tl" && capabilities.canApproveTl;
  const showReject = showApprove && capabilities.canRejectTransfer;
  const showSend = canEditList && detail.status.code === "pending_logistics";
  const listDirty =
    warehouseId !== detail.warehouse.id ||
    waybillNo !== (detail.waybillNo ?? "") ||
    notes !== (detail.notes ?? "") ||
    !sameIds(
      selected,
      detail.lines.map((line) => line.serialNumberId),
    );
  const doneLines = finishedPulloutSteps(detail.status.code, detail.createdAt, detail.history);

  function toggleSerial(serialNumberId: string, on: boolean) {
    setSelected((current) => {
      if (!on) return current.filter((id) => id !== serialNumberId);
      if (current.includes(serialNumberId)) return current;
      return [...current, serialNumberId];
    });
  }

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

  function submitList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditList || pending || selected.length === 0) return;
    if (detail.status.code === "pending_logistics" && !listDirty) return;
    saveList();
  }

  function wrapForm(workspace: ReactNode) {
    if (!canEditList) return workspace;
    return <form onSubmit={submitList}>{workspace}</form>;
  }

  function listBody(stockNote: boolean) {
    return (
      <div className="space-y-6">
        <PulloutListFields
          detail={detail}
          canEdit={canEditList}
          pending={pending}
          waybillNo={waybillNo}
          warehouseId={warehouseId}
          notes={notes}
          warehouses={warehouses}
          onWaybillNo={setWaybillNo}
          onWarehouseId={setWarehouseId}
          onNotes={setNotes}
        />
        <div className="space-y-4">
          <PulloutItemsTable
            rows={savedRows}
            canEditList={canEditList}
            pending={pending}
            selected={selected}
            onToggle={toggleSerial}
            title="Units on this pull-out"
            itemLabel="unit"
            toolbarActions={
              canEditList ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  aria-expanded={addOpen}
                  onClick={() => setAddOpen((open) => !open)}
                >
                  {addOpen ? "Hide serials" : "Add serials"}
                </Button>
              ) : undefined
            }
          />
          {canEditList && addOpen ? (
            <AddSerialsPanel
              state={extrasState}
              rows={availableSerials}
              pending={pending}
              selected={selected}
              onToggle={toggleSerial}
              onRetry={() => setExtrasAttempt((attempt) => attempt + 1)}
            />
          ) : null}
        </div>
        {stockNote ? (
          <p className="text-sm text-muted-foreground">
            Sending does not put stock in the warehouse yet.
          </p>
        ) : null}
      </div>
    );
  }

  function currentWorkspace(): ReactNode {
    const kind = pulloutOpenKind(detail.status.code);
    switch (kind) {
      case "pending_tl":
        return (
          <LogisticsStepWorkspace
            title="Waiting for approval"
            description="Team Lead approves or rejects this pull-out."
            actions={
              showApprove ? (
                <>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => approvePulloutTlAction(detail.id), "Pull-out approved")}
                  >
                    Approve
                  </Button>
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
                </>
              ) : undefined
            }
          >
            <div className="space-y-6">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field label="Branch">{textOrDash(detail.branch.name)}</Field>
                <Field label="Created by">{textOrDash(detail.createdByName)}</Field>
                <Field label="Reason">
                  <ReasonValue reason={detail.reason} />
                </Field>
              </dl>
              <ReadOnlyUnits rows={savedRows} title="Reserved serials" itemLabel="serial" />
            </div>
          </LogisticsStepWorkspace>
        );
      case "for_pullout":
        return wrapForm(
          <LogisticsStepWorkspace
            title="Prepare units"
            description="Confirm these units, then save the list."
            actions={
              canEditList ? (
                <Button type="submit" disabled={pending || selected.length === 0}>
                  Save list
                </Button>
              ) : undefined
            }
          >
            {listBody(false)}
          </LogisticsStepWorkspace>,
        );
      case "pending_logistics":
        return wrapForm(
          <LogisticsStepWorkspace
            title="Ready to send"
            description="The list is saved. Send it when the units are ready to leave."
            actions={
              showSend || (canEditList && listDirty) ? (
                <>
                  {canEditList && listDirty ? (
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={pending || selected.length === 0}
                    >
                      Save list
                    </Button>
                  ) : null}
                  {showSend ? (
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => releasePulloutAction(detail.id), "Pull-out is in transit")
                      }
                    >
                      Send
                    </Button>
                  ) : null}
                </>
              ) : undefined
            }
          >
            {listBody(true)}
          </LogisticsStepWorkspace>,
        );
      case "in_transit":
        return (
          <LogisticsStepWorkspace
            title="In transit"
            description="These units are in transit."
          >
            <div className="space-y-4">
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {`Warehouse receipt is not available yet. After this pull-out is sent, the units stay in transit at ${detail.branch.name}.`}
              </p>
              <ReadOnlyUnits rows={savedRows} title="Units on this pull-out" itemLabel="unit" />
            </div>
          </LogisticsStepWorkspace>
        );
      case "other":
        return <RecordedPullout detail={detail} />;
      default: {
        const unreachable: never = kind;
        return unreachable;
      }
    }
  }

  return (
    <div className="space-y-6">
      <LogisticsDocumentHeader
        backHref="/logistics/pickups"
        backLabel="Back to pull-outs"
        context="Pull-out"
        title={detail.pulloutNo}
        statusCode={detail.status.code}
        statusColor={detail.status.color}
        badges={
          <>
            <StatusCodeBadge
              code={detail.status.code}
              name={detail.status.name}
              color={detail.status.color}
            />
            {condition ? <RequestConditionBadge condition={condition} /> : null}
          </>
        }
      />

      <LogisticsProgressCard>
        <PulloutTracker
          status={detail.status}
          createdAt={detail.createdAt}
          history={detail.history}
        />
      </LogisticsProgressCard>

      {doneLines.length > 0 ? (
        <div className="space-y-2">
          {doneLines.map((step) => (
            <LogisticsDoneLine
              key={step.code}
              title={step.title}
              detail={doneLineDetail(step.at, step.actor)}
            />
          ))}
        </div>
      ) : null}

      {currentWorkspace()}

      <LogisticsHistoryCard
        items={detail.history.map((row) => ({
          id: row.id,
          label: historyLabel(row.action),
          actor: row.userName,
          at: row.at,
        }))}
      />

      <p className="text-sm text-muted-foreground">
        {detail.sapJob?.message ?? "No SAP request has been queued for this pull-out."}
      </p>
    </div>
  );
}
