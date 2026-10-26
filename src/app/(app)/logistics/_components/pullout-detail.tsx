"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  DocumentDetailBand,
  LogisticsHistoryBody,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { pulloutAuditLabel, PulloutTracker } from "@/app/(app)/logistics/_components/pullout-tracker";
import {
  CompactLineTable,
  CompactModelCell,
  type CompactLineColumn,
} from "@/components/compact-line-table";
import {
  RecordField,
  RecordFieldGrid,
  RecordReadout,
  RecordSection,
  RecordSheet,
} from "@/components/record-section";
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

const PULLOUT_LIST_FORM_ID = "pullout-list-form";

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
  wide = false,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <RecordField label={label} htmlFor={htmlFor} wide={wide}>
      {children}
    </RecordField>
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

function pulloutItemColumns(
  canEditList: boolean,
  pending: boolean,
  selected: readonly string[],
  onToggle: (serialNumberId: string, on: boolean) => void,
): CompactLineColumn<ItemRow>[] {
  const columns: CompactLineColumn<ItemRow>[] = [];
  if (canEditList) {
    columns.push({
      id: "include",
      header: <span className="sr-only">Include</span>,
      className: "w-12",
      cell: (row) => (
        <Checkbox
          checked={selected.includes(row.serialNumberId)}
          onCheckedChange={(value) => onToggle(row.serialNumberId, value === true)}
          disabled={pending}
          aria-label={`Keep ${row.serialNo}`}
        />
      ),
    });
  }
  columns.push(
    {
      id: "model",
      header: "Model",
      className: "min-w-44",
      cell: (row) => <CompactModelCell code={row.skuCode} name={row.modelName} />,
    },
    {
      id: "serial",
      header: "Serial number",
      className: "w-40 font-mono",
      cell: (row) => row.serialNo,
    },
    {
      id: "condition",
      header: "Inventory condition",
      cell: (row) => {
        const prior = asPriorCode(row.priorCode);
        return prior ? <StatusCodeBadge code={prior} name={prior} /> : <Dash />;
      },
    },
    {
      id: "classification",
      header: "Classification",
      cell: (row) => recordedNames(row.classificationNames),
    },
    {
      id: "packing",
      header: "Unit packing condition",
      cell: (row) => recordedNames(row.unitPackingConditionNames),
    },
    {
      id: "accessories",
      header: "Accessory completeness",
      cell: (row) => recordedNames(row.accessoryCompletenessNames),
    },
    {
      id: "hold",
      header: "Current hold",
      cell: (row) => {
        const hold = asHoldCode(row.inventoryCode);
        return hold ? <StatusCodeBadge code={hold} name={hold} /> : <Dash />;
      },
    },
  );
  return columns;
}

function PulloutItemsTable({
  rows,
  canEditList,
  pending,
  selected,
  onToggle,
  itemLabel = "unit",
  toolbarActions,
}: {
  rows: ItemRow[];
  canEditList: boolean;
  pending: boolean;
  selected: string[];
  onToggle: (serialNumberId: string, on: boolean) => void;
  itemLabel?: string;
  toolbarActions?: ReactNode;
}) {
  return (
    <CompactLineTable
      rows={rows}
      getRowId={(row) => row.serialNumberId}
      columns={pulloutItemColumns(canEditList, pending, selected, onToggle)}
      searchText={(row) => [
        row.skuCode,
        row.modelName,
        row.serialNo,
        row.priorCode,
        row.inventoryCode,
        ...row.classificationNames,
        ...row.unitPackingConditionNames,
        ...row.accessoryCompletenessNames,
      ]}
      searchPlaceholder="Search serials…"
      itemLabel={itemLabel}
      emptyMessage="No serials on this pull-out."
      noMatchMessage="No matching serials."
      toolbarAction={toolbarActions}
      minWidth="72rem"
    />
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
    <RecordReadout key={field.label} label={field.label} value={field.value} />
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
    <RecordFieldGrid>
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
      <Field label="Remarks" htmlFor={canEdit ? "pullout-remarks" : undefined} wide>
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
    </RecordFieldGrid>
  );
}

function extraSerialColumns(
  pending: boolean,
  selected: readonly string[],
  onToggle: (serialNumberId: string, on: boolean) => void,
): CompactLineColumn<ExtraSerial>[] {
  return [
    {
      id: "include",
      header: <span className="sr-only">Add</span>,
      className: "w-12",
      cell: (row) => (
        <Checkbox
          checked={selected.includes(row.serialNumberId)}
          onCheckedChange={(value) => onToggle(row.serialNumberId, value === true)}
          disabled={pending}
          aria-label={`Add ${row.serialNo}`}
        />
      ),
    },
    {
      id: "model",
      header: "Model",
      className: "min-w-44",
      cell: (row) => <CompactModelCell code={row.skuCode} name={row.modelName} />,
    },
    {
      id: "serial",
      header: "Serial number",
      className: "w-40 font-mono",
      cell: (row) => row.serialNo,
    },
    {
      id: "condition",
      header: "Inventory condition",
      cell: (row) => {
        const prior = asPriorCode(row.inventoryCode);
        return prior ? <StatusCodeBadge code={prior} name={prior} /> : <Dash />;
      },
    },
  ];
}

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
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Other serials</p>
      <CompactLineTable
        rows={rows}
        getRowId={(row) => row.serialNumberId}
        columns={extraSerialColumns(pending, selected, onToggle)}
        searchText={(row) => [row.skuCode, row.modelName, row.serialNo, row.inventoryCode]}
        searchPlaceholder="Search serials…"
        itemLabel="serial"
        emptyMessage="No other free serials at this branch."
        noMatchMessage="No matching serials."
        minWidth="40rem"
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
  itemLabel,
}: {
  rows: ItemRow[];
  itemLabel: string;
}) {
  return (
    <PulloutItemsTable
      rows={rows}
      canEditList={false}
      pending={false}
      selected={NO_SELECTION}
      onToggle={readOnlyToggle}
      itemLabel={itemLabel}
    />
  );
}

function RecordedPullout({ detail }: { detail: PulloutDetail }) {
  const remarks = detail.notes?.trim() ?? "";
  const waybill = detail.waybillNo?.trim() ?? "";
  const warehouse = joinedLabel(detail.warehouse.name, detail.warehouse.code);
  return (
    <>
      <RecordSection
        title="Pull-out"
        description="Branch, reason, and where these units were sent."
        divided
      >
        <RecordFieldGrid>
          <RecordReadout label="Branch" value={textOrDash(detail.branch.name)} />
          <RecordReadout label="Created by" value={textOrDash(detail.createdByName)} />
          <RecordReadout label="Reason" value={<ReasonValue reason={detail.reason} />} />
          <RecordReadout label="Destination warehouse" value={textOrDash(warehouse)} />
          {waybill ? <RecordReadout label="Waybill" value={waybill} /> : null}
          <ScheduleFields detail={detail} />
          {remarks ? (
            <RecordReadout label="Remarks" value={remarks} wide multiline />
          ) : null}
        </RecordFieldGrid>
      </RecordSection>
      <RecordSection title="Units" description="Serials on this pull-out." divided>
        <ReadOnlyUnits rows={savedItemRows(detail.lines)} itemLabel="unit" />
      </RecordSection>
    </>
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

  // "loading" is set by the handlers that start a fetch, not inside the effect.
  function toggleAddPanel() {
    if (!addOpen) setExtrasState("loading");
    setAddOpen(!addOpen);
  }

  function retryExtras() {
    setExtrasState("loading");
    setExtrasAttempt((attempt) => attempt + 1);
  }

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

  function listSections(title: string, description: string, stockNote: boolean) {
    return (
      <>
        <RecordSection title={title} description={description} divided>
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
          {stockNote ? (
            <p className="text-sm text-muted-foreground">
              Sending does not put stock in the warehouse yet.
            </p>
          ) : null}
        </RecordSection>
        <RecordSection title="Units" description="Serials on this pull-out." divided>
          <PulloutItemsTable
            rows={savedRows}
            canEditList={canEditList}
            pending={pending}
            selected={selected}
            onToggle={toggleSerial}
            itemLabel="unit"
            toolbarActions={
              canEditList ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  aria-expanded={addOpen}
                  onClick={toggleAddPanel}
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
              onRetry={retryExtras}
            />
          ) : null}
        </RecordSection>
      </>
    );
  }

  function workspaceSections(): ReactNode {
    const kind = pulloutOpenKind(detail.status.code);
    switch (kind) {
      case "pending_tl":
        return (
          <>
            <RecordSection
              title="Waiting for approval"
              description="Team Lead approves or rejects this pull-out."
              divided
            >
              <RecordFieldGrid>
                <RecordReadout label="Branch" value={textOrDash(detail.branch.name)} />
                <RecordReadout label="Created by" value={textOrDash(detail.createdByName)} />
                <RecordReadout label="Reason" value={<ReasonValue reason={detail.reason} />} />
              </RecordFieldGrid>
            </RecordSection>
            <RecordSection title="Units" description="Serials reserved for this pull-out." divided>
              <ReadOnlyUnits rows={savedRows} itemLabel="serial" />
            </RecordSection>
          </>
        );
      case "for_pullout":
        return listSections("Prepare units", "Confirm these units, then save the list.", false);
      case "pending_logistics":
        return listSections(
          "Ready to send",
          "The list is saved. Send it when the units are ready to leave.",
          true,
        );
      case "in_transit":
        return (
          <>
            <RecordSection title="In transit" description="These units are in transit." divided>
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {`Warehouse receipt is not available yet. After this pull-out is sent, the units stay in transit at ${detail.branch.name}.`}
              </p>
            </RecordSection>
            <RecordSection title="Units" description="Serials on this pull-out." divided>
              <ReadOnlyUnits rows={savedRows} itemLabel="unit" />
            </RecordSection>
          </>
        );
      case "other":
        return <RecordedPullout detail={detail} />;
      default: {
        const unreachable: never = kind;
        return unreachable;
      }
    }
  }

  function headerActions(): ReactNode {
    const kind = pulloutOpenKind(detail.status.code);
    switch (kind) {
      case "pending_tl":
        if (!showApprove) return null;
        return (
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
        );
      case "for_pullout":
        if (!canEditList) return null;
        return (
          <Button
            type="submit"
            form={PULLOUT_LIST_FORM_ID}
            disabled={pending || selected.length === 0}
          >
            Save list
          </Button>
        );
      case "pending_logistics":
        if (!showSend && !(canEditList && listDirty)) return null;
        return (
          <>
            {canEditList && listDirty ? (
              <Button
                type="submit"
                form={PULLOUT_LIST_FORM_ID}
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
                onClick={() => run(() => releasePulloutAction(detail.id), "Pull-out is in transit")}
              >
                Send
              </Button>
            ) : null}
          </>
        );
      case "in_transit":
      case "other":
        return null;
      default: {
        const unreachable: never = kind;
        return unreachable;
      }
    }
  }

  const sheet = (
    <RecordSheet>
      <RecordSection title="Progress">
        <PulloutTracker
          status={detail.status}
          createdAt={detail.createdAt}
          history={detail.history}
        />
      </RecordSection>
      {workspaceSections()}
      <RecordSection title="History" divided>
        <LogisticsHistoryBody
          items={detail.history.map((row) => ({
            id: row.id,
            label: pulloutAuditLabel(row.action),
            actor: row.userName,
            at: row.at,
          }))}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          {detail.sapJob?.message ?? "No SAP request has been queued for this pull-out."}
        </p>
      </RecordSection>
    </RecordSheet>
  );

  return (
    <div className="space-y-6">
      <DocumentDetailBand
        backHref="/logistics/pickups"
        backLabel="Back to pull-outs"
        title={detail.pulloutNo}
        statusLine={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{detail.status.name}</span>
            {condition ? <RequestConditionBadge condition={condition} /> : null}
          </span>
        }
        actions={headerActions()}
      />
      {canEditList ? (
        <form id={PULLOUT_LIST_FORM_ID} onSubmit={submitList}>
          {sheet}
        </form>
      ) : (
        sheet
      )}
    </div>
  );
}
