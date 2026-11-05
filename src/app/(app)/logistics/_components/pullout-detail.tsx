"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type ChangeEvent,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  PULLOUT_ATTACHMENT_ACCEPT,
  PULLOUT_ATTACHMENT_MAX_FILES,
} from "@/features/logistics/constants/pullout-attachments";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import {
  PULLOUT_WORKFLOW_CODE,
  workflowStatusLabel,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import {
  approvePulloutLineAction,
  approvePulloutTlAction,
  deletePulloutLineAction,
  listPulloutSerialsAction,
  listWarehousesForLogisticsAction,
  rejectPulloutAction,
  releasePulloutAction,
  updatePulloutListAction,
  uploadPulloutAttachmentAction,
} from "@/features/logistics/actions/logistics.actions";
import {
  manilaDateTimeInputValue,
  scheduleDateInputValue,
} from "@/features/logistics/lib/shipment";
import {
  PULLOUT_LINE_DECISION,
  type PulloutConditionView,
} from "@/features/logistics/services/pullout-posting.planner";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

const PULLOUT_LIST_FORM_ID = "pullout-list-form";

type ItemRow = PulloutDetail["lines"][number];

interface ExtraSerial {
  serialNumberId: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  inventoryCode: "STK" | "DEF";
}

type ExtraSerialLoad = "idle" | "loading" | "ready" | "error";

const PULLOUT_ATTACHMENT_OPEN_CODES: readonly string[] = [
  PULLOUT_WORKFLOW_CODE.pending_tl,
  PULLOUT_WORKFLOW_CODE.for_pullout,
  PULLOUT_WORKFLOW_CODE.pending_logistics,
  PULLOUT_WORKFLOW_CODE.in_transit,
];

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

function RequestConditionBadge({ condition }: { condition: PulloutConditionView }) {
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
  showClassification: boolean,
  renderAction: ((row: ItemRow) => ReactNode) | null,
): CompactLineColumn<ItemRow>[] {
  const columns: CompactLineColumn<ItemRow>[] = [
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
      id: "status",
      header: "Status",
      cell: (row) => {
        const prior = asPriorCode(row.priorCode);
        return prior ? <StatusCodeBadge code={prior} name={prior} /> : <Dash />;
      },
    },
  ];
  if (showClassification) {
    columns.push({
      id: "classification",
      header: "Classification",
      cell: (row) => recordedNames(row.classificationNames),
    });
  }
  columns.push(
    {
      id: "packing",
      header: "Unit packing condition",
      cell: (row) => recordedNames(row.unitPackingConditionNames),
    },
    {
      id: "accessories",
      header: "Acc completeness",
      cell: (row) => recordedNames(row.accessoryCompletenessNames),
    },
    {
      id: "remarks",
      header: "Remarks",
      cell: (row) => textOrDash(row.remarks),
    },
  );
  if (renderAction) {
    columns.push({
      id: "actions",
      header: "Actions",
      align: "right",
      className: "w-44",
      cell: renderAction,
    });
  }
  return columns;
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

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const ids = new Set(right);
  return left.every((id) => ids.has(id));
}

function stageDescription(code: string): string {
  switch (code) {
    case PULLOUT_WORKFLOW_CODE.pending_tl:
      return "Team Lead approves or deletes each unit, or decides the whole pull-out.";
    case PULLOUT_WORKFLOW_CODE.for_pullout:
      return "Logistics confirms these units, then saves the list.";
    case PULLOUT_WORKFLOW_CODE.pending_logistics:
      return "The list is saved. Send it when the units are ready to leave.";
    case PULLOUT_WORKFLOW_CODE.in_transit:
      return "These units are in transit.";
    default:
      return "Who asked for this pull-out and what it covers.";
  }
}

function AttachmentLinks({ attachments }: { attachments: PulloutDetail["attachments"] }) {
  if (attachments.length === 0) return <span className="text-muted-foreground">No files attached.</span>;
  return (
    <ul className="space-y-1">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <a
            href={`/api/logistics/pullout-attachments/${encodeURIComponent(attachment.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline underline-offset-2 hover:text-primary"
          >
            {attachment.fileName}
          </a>
        </li>
      ))}
    </ul>
  );
}

function RequestorSection({
  detail,
  canAttach,
  pending,
  onAttach,
}: {
  detail: PulloutDetail;
  canAttach: boolean;
  pending: boolean;
  onAttach: (file: File) => void;
}) {
  const remarks = detail.notes?.trim() ?? "";

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onAttach(file);
  }

  return (
    <RecordSection title="Requestor" description={stageDescription(detail.status.code)} divided>
      <RecordFieldGrid>
        <RecordReadout label="Branch Name" value={textOrDash(detail.branch.name)} />
        <RecordReadout label="Created By" value={textOrDash(detail.createdByName)} />
        <RecordReadout label="Created Date" value={textOrDash(formatWhen(detail.createdAt, false))} />
        <RecordReadout
          label="Status"
          value={detail.condition ? <RequestConditionBadge condition={detail.condition} /> : <Dash />}
        />
        <RecordReadout
          label="Pull-out Status"
          value={
            <StatusCodeBadge
              code={detail.status.code}
              name={workflowStatusLabel(detail.status)}
              color={detail.status.color}
            />
          }
        />
        {detail.reason ? (
          <RecordReadout label="Reason" value={<ReasonValue reason={detail.reason} />} />
        ) : null}
        <RecordReadout
          label="Attachments"
          value={<AttachmentLinks attachments={detail.attachments} />}
          wide
        />
        {canAttach ? (
          <Field label="Attach a file" htmlFor="pullout-attachment" wide>
            <Input
              id="pullout-attachment"
              type="file"
              accept={PULLOUT_ATTACHMENT_ACCEPT}
              disabled={pending}
              onChange={pickFile}
            />
          </Field>
        ) : null}
        {remarks ? <RecordReadout label="Remarks" value={remarks} wide multiline /> : null}
      </RecordFieldGrid>
    </RecordSection>
  );
}

function ReasonValue({ reason }: { reason: PulloutDetail["reason"] }) {
  if (!reason) return <Dash />;
  return <StatusCodeBadge code={reason.code} name={reason.name} color={reason.color} />;
}

function LogisticsSection({
  detail,
  canEdit,
  pending,
  waybillNo,
  warehouseId,
  scheduledAt,
  actualDate,
  warehouses,
  onWaybillNo,
  onWarehouseId,
  onScheduledAt,
  onActualDate,
  note,
}: {
  detail: PulloutDetail;
  canEdit: boolean;
  pending: boolean;
  waybillNo: string;
  warehouseId: string;
  scheduledAt: string;
  actualDate: string;
  warehouses: { id: string; name: string; code: string }[];
  onWaybillNo: (value: string) => void;
  onWarehouseId: (value: string) => void;
  onScheduledAt: (value: string) => void;
  onActualDate: (value: string) => void;
  note: ReactNode;
}) {
  const warehouseChoices = warehouses.length > 0 ? warehouses : [detail.warehouse];
  const warehouseLabel = joinedLabel(detail.warehouse.name, detail.warehouse.code);
  const scheduledBy = <RecordReadout label="Scheduled by" value={textOrDash(detail.scheduledByName)} />;
  return (
    <RecordSection title="Logistics" divided>
      <RecordFieldGrid>
        {canEdit ? (
          <>
            <Field label="Waybill No" htmlFor="pullout-waybill">
              <Input
                id="pullout-waybill"
                value={waybillNo}
                disabled={pending}
                onChange={(event) => onWaybillNo(event.target.value)}
              />
            </Field>
            <Field label="Date-Time Schedule" htmlFor="pullout-schedule">
              <Input
                id="pullout-schedule"
                type="datetime-local"
                value={scheduledAt}
                disabled={pending}
                onChange={(event) => onScheduledAt(event.target.value)}
              />
            </Field>
            {scheduledBy}
            <Field label="Actual pull-out date" htmlFor="pullout-actual-date">
              <Input
                id="pullout-actual-date"
                type="date"
                value={actualDate}
                disabled={pending}
                onChange={(event) => onActualDate(event.target.value)}
              />
            </Field>
            <Field label="Destination warehouse" htmlFor="pullout-warehouse">
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
            </Field>
          </>
        ) : (
          <>
            <RecordReadout label="Waybill No" value={textOrDash(detail.waybillNo)} />
            <RecordReadout
              label="Date-Time Schedule"
              value={textOrDash(formatWhen(detail.scheduledAt, true))}
            />
            {scheduledBy}
            <RecordReadout
              label="Actual pull-out date"
              value={textOrDash(formatWhen(detail.actualScheduledDate, false))}
            />
            <RecordReadout label="Destination warehouse" value={textOrDash(warehouseLabel)} />
          </>
        )}
      </RecordFieldGrid>
      {note}
    </RecordSection>
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

export function PulloutDetailView({
  detail,
  capabilities,
  branchScope,
  workflowStatuses,
}: {
  detail: PulloutDetail;
  capabilities: LogisticsActionCapabilities;
  branchScope: string[] | null;
  workflowStatuses: readonly WorkflowStatusOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canEditList =
    (detail.status.code === PULLOUT_WORKFLOW_CODE.for_pullout ||
      detail.status.code === PULLOUT_WORKFLOW_CODE.pending_logistics) &&
    capabilities.canManage &&
    inScope(branchScope, detail.branch.id);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]);
  const [extraSerials, setExtraSerials] = useState<ExtraSerial[]>([]);
  const [warehouseId, setWarehouseId] = useState(detail.warehouse.id);
  const [waybillNo, setWaybillNo] = useState(detail.waybillNo ?? "");
  const [scheduledAt, setScheduledAt] = useState(manilaDateTimeInputValue(detail.scheduledAt));
  const [actualDate, setActualDate] = useState(scheduleDateInputValue(detail.actualScheduledDate));
  const [selected, setSelected] = useState<string[]>(detail.lines.map((line) => line.serialNumberId));
  const [addOpen, setAddOpen] = useState(false);
  const [extrasState, setExtrasState] = useState<ExtraSerialLoad>("idle");
  const [extrasAttempt, setExtrasAttempt] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ItemRow | null>(null);
  const addCondition =
    detail.condition === "STK" || detail.condition === "DEF" ? detail.condition : undefined;

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
    void listPulloutSerialsAction(detail.branch.id, addCondition).then((result) => {
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
  }, [addOpen, addCondition, canEditList, detail.branch.id, extrasAttempt]);

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

  const onPulloutIds = new Set(detail.lines.map((line) => line.serialNumberId));
  const availableSerials = extraSerials.filter((serial) => !onPulloutIds.has(serial.serialNumberId));
  const isReserve = detail.status.code === PULLOUT_WORKFLOW_CODE.pending_tl;
  const showApprove = isReserve && capabilities.canApproveTl;
  const showReject = showApprove && capabilities.canRejectTransfer;
  const showSend = canEditList && detail.status.code === PULLOUT_WORKFLOW_CODE.pending_logistics;
  const canAttach =
    capabilities.canCreate &&
    inScope(branchScope, detail.branch.id) &&
    PULLOUT_ATTACHMENT_OPEN_CODES.includes(detail.status.code) &&
    detail.attachments.length < PULLOUT_ATTACHMENT_MAX_FILES;
  const listDirty =
    warehouseId !== detail.warehouse.id ||
    waybillNo !== (detail.waybillNo ?? "") ||
    scheduledAt !== manilaDateTimeInputValue(detail.scheduledAt) ||
    actualDate !== scheduleDateInputValue(detail.actualScheduledDate) ||
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
          scheduledAt,
          actualPulloutDate: actualDate,
          serialNumberIds: selected,
        }),
      "Pull-out list saved",
    );
  }

  function submitList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditList || pending || selected.length === 0) return;
    if (detail.status.code === PULLOUT_WORKFLOW_CODE.pending_logistics && !listDirty) return;
    saveList();
  }

  function attachFile(file: File) {
    const formData = new FormData();
    formData.set("pulloutId", detail.id);
    formData.set("file", file);
    run(() => uploadPulloutAttachmentAction(formData), "File attached");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const { serialNumberId } = deleteTarget;
    setDeleteTarget(null);
    run(() => deletePulloutLineAction(detail.id, serialNumberId), "Unit deleted from this pull-out");
  }

  function reserveLineAction(row: ItemRow) {
    const approved = row.decision === PULLOUT_LINE_DECISION.accepted;
    return (
      <div className="flex items-center justify-end gap-2">
        {approved ? (
          <span className="text-xs text-emerald-700">Approved</span>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            aria-label={`Approve ${row.serialNo}`}
            onClick={() => run(() => approvePulloutLineAction(detail.id, row.serialNumberId), "Unit approved")}
          >
            Approve
          </Button>
        )}
        {capabilities.canRejectTransfer ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || detail.lines.length === 1}
            title={detail.lines.length === 1 ? "Reject the pull-out instead" : undefined}
            aria-label={`Delete ${row.serialNo}`}
            onClick={() => setDeleteTarget(row)}
          >
            Delete
          </Button>
        ) : null}
      </div>
    );
  }

  function listLineAction(row: ItemRow) {
    if (selected.includes(row.serialNumberId)) {
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          aria-label={`Delete ${row.serialNo}`}
          onClick={() => toggleSerial(row.serialNumberId, false)}
        >
          Delete
        </Button>
      );
    }
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Removed on save</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          aria-label={`Keep ${row.serialNo}`}
          onClick={() => toggleSerial(row.serialNumberId, true)}
        >
          Undo
        </Button>
      </div>
    );
  }

  function lineActionRenderer(): ((row: ItemRow) => ReactNode) | null {
    if (showApprove) return reserveLineAction;
    if (canEditList) return listLineAction;
    return null;
  }

  function logisticsNote(): ReactNode {
    if (detail.status.code === PULLOUT_WORKFLOW_CODE.pending_logistics) {
      return (
        <p className="text-sm text-muted-foreground">
          Sending does not put stock in the warehouse yet.
        </p>
      );
    }
    if (detail.status.code === PULLOUT_WORKFLOW_CODE.in_transit) {
      return (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {`Warehouse receipt is not available yet. After this pull-out is sent, the units stay in transit at ${detail.branch.name}.`}
        </p>
      );
    }
    return null;
  }

  function headerActions(): ReactNode {
    if (isReserve) {
      if (!showApprove) return null;
      return (
        <>
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => approvePulloutTlAction(detail.id), "Pull-out approved")}
          >
            Approve all
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
    }
    if (!canEditList) return null;
    if (detail.status.code === PULLOUT_WORKFLOW_CODE.for_pullout) {
      return (
        <Button
          type="submit"
          form={PULLOUT_LIST_FORM_ID}
          disabled={pending || selected.length === 0}
        >
          Save list
        </Button>
      );
    }
    return (
      <>
        {listDirty ? (
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
            disabled={pending || listDirty}
            title={listDirty ? "Save the list first" : undefined}
            onClick={() => run(() => releasePulloutAction(detail.id), "Pull-out is in transit")}
          >
            Send
          </Button>
        ) : null}
      </>
    );
  }

  const sheet = (
    <RecordSheet>
      <RecordSection title="Progress">
        <PulloutTracker
          status={detail.status}
          createdAt={detail.createdAt}
          history={detail.history}
          catalog={workflowStatuses}
        />
      </RecordSection>
      <RequestorSection
        detail={detail}
        canAttach={canAttach}
        pending={pending}
        onAttach={attachFile}
      />
      <LogisticsSection
        detail={detail}
        canEdit={canEditList}
        pending={pending}
        waybillNo={waybillNo}
        warehouseId={warehouseId}
        scheduledAt={scheduledAt}
        actualDate={actualDate}
        warehouses={warehouses}
        onWaybillNo={setWaybillNo}
        onWarehouseId={setWarehouseId}
        onScheduledAt={setScheduledAt}
        onActualDate={setActualDate}
        note={logisticsNote()}
      />
      <RecordSection title="Transfer details" description="Serials on this pull-out." divided>
        <CompactLineTable
          rows={detail.lines}
          getRowId={(row) => row.serialNumberId}
          columns={pulloutItemColumns(detail.condition !== "DEF", lineActionRenderer())}
          searchText={(row) => [
            row.skuCode,
            row.modelName,
            row.serialNo,
            row.priorCode,
            row.remarks,
            ...row.classificationNames,
            ...row.unitPackingConditionNames,
            ...row.accessoryCompletenessNames,
          ]}
          searchPlaceholder="Search serials…"
          itemLabel="unit"
          emptyMessage="No serials on this pull-out."
          noMatchMessage="No matching serials."
          toolbarAction={
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
          minWidth="72rem"
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
            <StatusCodeBadge
              code={detail.status.code}
              name={detail.status.name}
              color={detail.status.color}
            />
            {detail.condition ? <RequestConditionBadge condition={detail.condition} /> : null}
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
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${deleteTarget?.serialNo ?? "this unit"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The unit comes off this pull-out and goes back to its branch status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
