"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useId,
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
import { ShipmentPrintButton } from "@/app/(app)/logistics/_components/shipment-print-button";
import {
  EMPTY_CHECKLIST_OPTIONS,
  PULLOUT_LINE_FIELDS,
  PulloutLineField,
  pulloutLineChoice,
  pulloutLineComplete,
  pulloutLineInput,
  pulloutMissingDetailsText,
  type PulloutLineChoice,
} from "@/app/(app)/logistics/_components/pullout-line-fields";
import { pulloutPrintDocument } from "@/app/(app)/logistics/_components/pullout-print";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
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
  completePulloutAction,
  deletePulloutLineAction,
  listPulloutChecklistOptionsAction,
  listPulloutSerialsAction,
  listWarehousesForLogisticsAction,
  rejectPulloutAction,
  rejectPulloutLineAction,
  releasePulloutAction,
  updatePulloutListAction,
  uploadPulloutAttachmentAction,
  type PulloutChecklistOptions,
} from "@/features/logistics/actions/logistics.actions";
import {
  manilaDateTimeInputValue,
  scheduleDateInputValue,
} from "@/features/logistics/lib/shipment";
import {
  PULLOUT_LINE_DECISION,
  PULLOUT_REJECTION_REMARKS_MAX,
  defaultReceiveLocation,
} from "@/features/logistics/services/pullout-posting.planner";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";
import { PulloutConditionBadge } from "@/features/logistics/components/pullout-condition-badge";
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

/** What a serial being added needs: the same details as on the request. */
interface ExtraSerialDetails {
  options: PulloutChecklistOptions;
  choices: Readonly<Record<string, PulloutLineChoice>>;
  onChange: (serialNumberId: string, patch: Partial<PulloutLineChoice>) => void;
}

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

function ReasonCell({ row }: { row: ItemRow }) {
  if (!row.reasonName && row.problemDescriptionNames.length === 0) return <Dash />;
  return (
    <div>
      {row.reasonName ? <p>{row.reasonName}</p> : null}
      {row.problemDescriptionNames.length > 0 ? (
        <ul className="text-xs text-muted-foreground">
          {row.problemDescriptionNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReceivedCell({ row }: { row: ItemRow }) {
  if (row.rejectedAt) {
    const who = [formatWhen(row.rejectedAt, true), row.rejectedByName].filter(Boolean).join(" · ");
    return (
      <div>
        <p className="text-destructive">Rejected, back at branch</p>
        {row.rejectionRemarks ? <p>{row.rejectionRemarks}</p> : null}
        {who ? <p className="text-xs text-muted-foreground">{who}</p> : null}
      </div>
    );
  }
  if (!row.receivedAt) return <span className="text-muted-foreground">In transit</span>;
  const who = [formatWhen(row.receivedAt, true), row.receivedByName].filter(Boolean).join(" · ");
  return (
    <div>
      <p>{row.receivedLocation ? (joinedLabel(row.receivedLocation.name, row.receivedLocation.code) ?? "—") : "—"}</p>
      {who ? <p className="text-xs text-muted-foreground">{who}</p> : null}
    </div>
  );
}

function pulloutItemColumns(
  renderAction: ((row: ItemRow) => ReactNode) | null,
  renderReceived: ((row: ItemRow) => ReactNode) | null,
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
    {
      id: "reason",
      header: "Reason",
      className: "min-w-40",
      cell: (row) => <ReasonCell row={row} />,
    },
    {
      id: "classification",
      header: "Classification",
      cell: (row) =>
        row.classificationNames.length > 0 ? recordedNames(row.classificationNames) : <Dash />,
    },
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
  ];
  if (renderReceived) {
    columns.push({
      id: "received",
      header: "Warehouse location",
      className: "min-w-52",
      cell: renderReceived,
    });
  }
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
          value={detail.condition ? <PulloutConditionBadge condition={detail.condition} /> : <Dash />}
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
  courierName,
  warehouseId,
  scheduledAt,
  actualDate,
  warehouses,
  onWaybillNo,
  onCourierName,
  onWarehouseId,
  onScheduledAt,
  onActualDate,
  note,
}: {
  detail: PulloutDetail;
  canEdit: boolean;
  pending: boolean;
  waybillNo: string;
  courierName: string;
  warehouseId: string;
  scheduledAt: string;
  actualDate: string;
  warehouses: { id: string; name: string; code: string }[];
  onWaybillNo: (value: string) => void;
  onCourierName: (value: string) => void;
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
            <Field label="Courier" htmlFor="pullout-courier">
              <Input
                id="pullout-courier"
                value={courierName}
                maxLength={120}
                disabled={pending}
                onChange={(event) => onCourierName(event.target.value)}
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
            <RecordReadout label="Courier" value={textOrDash(detail.courierName)} />
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
  details: ExtraSerialDetails,
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
    ...PULLOUT_LINE_FIELDS.map(
      ({ field, header }): CompactLineColumn<ExtraSerial> => ({
        id: field,
        header,
        className: "min-w-44",
        cell: (row) => (
          <PulloutLineField
            field={field}
            serialNumberId={row.serialNumberId}
            serialNo={row.serialNo}
            unitCode={row.inventoryCode}
            options={details.options}
            choice={pulloutLineChoice(details.choices, row.serialNumberId)}
            disabled={pending || !selected.includes(row.serialNumberId)}
            onChange={(patch) => details.onChange(row.serialNumberId, patch)}
          />
        ),
      }),
    ),
  ];
}

function ExtraSerialsTable({
  rows,
  pending,
  selected,
  onToggle,
  details,
}: {
  rows: ExtraSerial[];
  pending: boolean;
  selected: string[];
  onToggle: (serialNumberId: string, on: boolean) => void;
  details: ExtraSerialDetails;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Other serials</p>
      <CompactLineTable
        rows={rows}
        getRowId={(row) => row.serialNumberId}
        columns={extraSerialColumns(pending, selected, onToggle, details)}
        searchText={(row) => [row.skuCode, row.modelName, row.serialNo, row.inventoryCode]}
        searchPlaceholder="Search serials…"
        itemLabel="serial"
        emptyMessage="No other free serials at this branch."
        noMatchMessage="No matching serials."
        minWidth="86rem"
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
  details,
}: {
  state: ExtraSerialLoad;
  rows: ExtraSerial[];
  pending: boolean;
  selected: string[];
  onToggle: (serialNumberId: string, on: boolean) => void;
  onRetry: () => void;
  details: ExtraSerialDetails;
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
        <ExtraSerialsTable
          rows={rows}
          pending={pending}
          selected={selected}
          onToggle={onToggle}
          details={details}
        />
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
  const [courierName, setCourierName] = useState(detail.courierName ?? "");
  const [scheduledAt, setScheduledAt] = useState(manilaDateTimeInputValue(detail.scheduledAt));
  const [actualDate, setActualDate] = useState(scheduleDateInputValue(detail.actualScheduledDate));
  const [selected, setSelected] = useState<string[]>(detail.lines.map((line) => line.serialNumberId));
  const [addOpen, setAddOpen] = useState(false);
  const [extrasState, setExtrasState] = useState<ExtraSerialLoad>("idle");
  const [extrasAttempt, setExtrasAttempt] = useState(0);
  const [extraChoices, setExtraChoices] = useState<Record<string, PulloutLineChoice>>({});
  const [checklistOptions, setChecklistOptions] =
    useState<PulloutChecklistOptions>(EMPTY_CHECKLIST_OPTIONS);
  const [deleteTarget, setDeleteTarget] = useState<ItemRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ItemRow | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const rejectRemarksId = useId();
  const [receiveIds, setReceiveIds] = useState<string[]>([]);
  const [receiveLocationBySerial, setReceiveLocationBySerial] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        detail.lines.map((line) => [
          line.serialNumberId,
          defaultReceiveLocation(line.recordedLocationId, detail.receiveLocations),
        ]),
      ),
  );

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

  useEffect(() => {
    if (!addOpen || !canEditList) return;
    let cancelled = false;
    void listPulloutChecklistOptionsAction().then((result) => {
      if (cancelled) return;
      if (result.error) toast.error(result.error);
      else setChecklistOptions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [addOpen, canEditList]);

  // "loading" is set by the handlers that start a fetch, not inside the effect.
  function toggleAddPanel() {
    if (!addOpen) setExtrasState("loading");
    setAddOpen(!addOpen);
  }

  function retryExtras() {
    setExtrasState("loading");
    setExtrasAttempt((attempt) => attempt + 1);
  }

  function run(action: () => Promise<{ error: string } | { success: true }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function toggleReceive(serialNumberId: string, checked: boolean) {
    setReceiveIds((current) =>
      checked ? [...current, serialNumberId] : current.filter((id) => id !== serialNumberId),
    );
  }

  function setReceiveLocation(serialNumberIds: readonly string[], locationId: string) {
    setReceiveLocationBySerial((current) => ({
      ...current,
      ...Object.fromEntries(serialNumberIds.map((id) => [id, locationId])),
    }));
  }

  function receiveSelected() {
    startTransition(async () => {
      const result = await completePulloutAction(detail.id, {
        lines: receiveIds.map((serialNumberId) => ({
          serialNumberId,
          warehouseLocationId: receiveLocationBySerial[serialNumberId] ?? "",
        })),
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.completed ? "Pull-out received and completed" : "Units received");
      setReceiveIds([]);
      router.refresh();
    });
  }

  const onPulloutIds = new Set(detail.lines.map((line) => line.serialNumberId));
  const availableSerials = extraSerials.filter((serial) => !onPulloutIds.has(serial.serialNumberId));
  const addedSerials = availableSerials.filter((serial) => selected.includes(serial.serialNumberId));
  const addedMissing = addedSerials.filter(
    (serial) =>
      !pulloutLineComplete(
        serial.inventoryCode,
        pulloutLineChoice(extraChoices, serial.serialNumberId),
      ),
  );
  const canSaveList = selected.length > 0 && addedMissing.length === 0;
  const isReserve = detail.status.code === PULLOUT_WORKFLOW_CODE.pending_tl;
  const showApprove = isReserve && capabilities.canApproveTl;
  const showReject = showApprove && capabilities.canRejectTransfer;
  const showSend = canEditList && detail.status.code === PULLOUT_WORKFLOW_CODE.pending_logistics;
  const inTransit = detail.status.code === PULLOUT_WORKFLOW_CODE.in_transit;
  const canReceive = inTransit && capabilities.canCompletePullout;
  const showReceipts =
    inTransit ||
    detail.status.code === PULLOUT_WORKFLOW_CODE.completed ||
    detail.lines.some((line) => line.rejectedAt);
  const awaitingIds = detail.lines
    .filter((line) => !line.receivedAt && !line.rejectedAt)
    .map((line) => line.serialNumberId);
  const printDocument = pulloutPrintDocument(detail);
  const receiveOptions = detail.receiveLocations.map((location) => ({
    id: location.id,
    label: joinedLabel(location.name, location.code) ?? location.name,
  }));
  const receiveReady =
    receiveIds.length > 0 && receiveIds.every((id) => receiveLocationBySerial[id]);
  const canAttach =
    capabilities.canCreate &&
    inScope(branchScope, detail.branch.id) &&
    PULLOUT_ATTACHMENT_OPEN_CODES.includes(detail.status.code) &&
    detail.attachments.length < PULLOUT_ATTACHMENT_MAX_FILES;
  const listDirty =
    warehouseId !== detail.warehouse.id ||
    waybillNo !== (detail.waybillNo ?? "") ||
    courierName !== (detail.courierName ?? "") ||
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
          courierName,
          scheduledAt,
          actualPulloutDate: actualDate,
          serialNumberIds: selected,
          addedLines: addedSerials.map((serial) =>
            pulloutLineInput(
              serial.serialNumberId,
              serial.inventoryCode,
              pulloutLineChoice(extraChoices, serial.serialNumberId),
            ),
          ),
        }),
      "Pull-out list saved",
    );
  }

  function submitList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditList || pending || !canSaveList) return;
    if (detail.status.code === PULLOUT_WORKFLOW_CODE.pending_logistics && !listDirty) return;
    saveList();
  }

  function updateExtraChoice(serialNumberId: string, patch: Partial<PulloutLineChoice>) {
    setExtraChoices((current) => ({
      ...current,
      [serialNumberId]: { ...pulloutLineChoice(current, serialNumberId), ...patch },
    }));
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

  function closeReject() {
    setRejectTarget(null);
    setRejectRemarks("");
  }

  function confirmReject() {
    if (!rejectTarget) return;
    const { serialNumberId } = rejectTarget;
    const remarks = rejectRemarks.trim();
    closeReject();
    toggleReceive(serialNumberId, false);
    run(() => rejectPulloutLineAction(detail.id, serialNumberId, { remarks }), "Unit rejected");
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

  function receiveLineAction(row: ItemRow) {
    if (row.receivedAt) return <span className="text-xs text-emerald-700">Received</span>;
    if (row.rejectedAt) return <span className="text-xs text-destructive">Rejected</span>;
    return (
      <div className="flex items-center justify-end gap-2">
        <Checkbox
          checked={receiveIds.includes(row.serialNumberId)}
          disabled={pending || receiveOptions.length === 0}
          aria-label={`Receive ${row.serialNo}`}
          onCheckedChange={(value) => toggleReceive(row.serialNumberId, value === true)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          aria-label={`Reject ${row.serialNo}`}
          onClick={() => setRejectTarget(row)}
        >
          Reject
        </Button>
      </div>
    );
  }

  function receiveLocationCell(row: ItemRow) {
    if (row.receivedAt || row.rejectedAt) return <ReceivedCell row={row} />;
    return (
      <SearchableSelect
        id={`receive-location-${row.serialNumberId}`}
        ariaLabel={`Warehouse location for ${row.serialNo}`}
        options={receiveOptions}
        value={receiveLocationBySerial[row.serialNumberId] ?? ""}
        onChange={(locationId) => setReceiveLocation([row.serialNumberId], locationId)}
        placeholder="Select location…"
        searchPlaceholder="Search locations…"
        disabled={pending || !receiveIds.includes(row.serialNumberId)}
      />
    );
  }

  function lineActionRenderer(): ((row: ItemRow) => ReactNode) | null {
    if (showApprove) return reserveLineAction;
    if (canEditList) return listLineAction;
    if (canReceive) return receiveLineAction;
    return null;
  }

  function receivedRenderer(): ((row: ItemRow) => ReactNode) | null {
    if (canReceive) return receiveLocationCell;
    return showReceipts ? (row) => <ReceivedCell row={row} /> : null;
  }

  function receiveToolbar(): ReactNode {
    if (!canReceive || awaitingIds.length === 0) return undefined;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          id="receive-location-all"
          className="w-56"
          options={receiveOptions}
          value=""
          onChange={(locationId) => setReceiveLocation(receiveIds, locationId)}
          placeholder="Set location for selected"
          searchPlaceholder="Search locations…"
          disabled={pending || receiveIds.length === 0}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending || receiveOptions.length === 0}
          onClick={() =>
            setReceiveIds(receiveIds.length === awaitingIds.length ? [] : awaitingIds)
          }
        >
          {receiveIds.length === awaitingIds.length ? "Clear selection" : "Select all"}
        </Button>
      </div>
    );
  }

  function logisticsNote(): ReactNode {
    if (detail.status.code === PULLOUT_WORKFLOW_CODE.pending_logistics) {
      return (
        <p className="text-sm text-muted-foreground">
          {printDocument
            ? "Sending puts the units in transit. The warehouse receives them next."
            : "Save the waybill, courier and schedule to print the slip. Sending puts the units in transit."}
        </p>
      );
    }
    if (!inTransit) return null;
    if (canReceive && receiveOptions.length === 0) {
      return (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {`${detail.warehouse.name} has no locations yet. Add one in Settings → Warehouses to receive these units.`}
        </p>
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        {canReceive
          ? "Tick the units that arrived and choose where each one goes. Reject a unit that did not arrive. Units you leave stay in transit."
          : `Units stay in transit at ${detail.branch.name} until the warehouse receives them.`}
      </p>
    );
  }

  function headerActions(): ReactNode {
    if (canReceive) {
      return (
        <Button
          type="button"
          disabled={pending || !receiveReady}
          title={
            receiveIds.length > 0 && !receiveReady ? "Choose a location for every unit" : undefined
          }
          onClick={receiveSelected}
        >
          {receiveIds.length > 0 ? `Receive ${receiveIds.length}` : "Receive"}
        </Button>
      );
    }
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
        <Button type="submit" form={PULLOUT_LIST_FORM_ID} disabled={pending || !canSaveList}>
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
            disabled={pending || !canSaveList}
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
        courierName={courierName}
        warehouseId={warehouseId}
        scheduledAt={scheduledAt}
        actualDate={actualDate}
        warehouses={warehouses}
        onWaybillNo={setWaybillNo}
        onCourierName={setCourierName}
        onWarehouseId={setWarehouseId}
        onScheduledAt={setScheduledAt}
        onActualDate={setActualDate}
        note={logisticsNote()}
      />
      <RecordSection title="Transfer details" description="Serials on this pull-out." divided>
        <CompactLineTable
          rows={detail.lines}
          getRowId={(row) => row.serialNumberId}
          columns={pulloutItemColumns(lineActionRenderer(), receivedRenderer())}
          searchText={(row) => [
            row.skuCode,
            row.modelName,
            row.serialNo,
            row.priorCode,
            row.remarks,
            row.reasonName,
            row.rejectionRemarks,
            row.receivedLocation?.code,
            row.receivedLocation?.name,
            ...row.problemDescriptionNames,
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
            ) : (
              receiveToolbar()
            )
          }
          minWidth={showReceipts ? "96rem" : "82rem"}
        />
        {canEditList && addOpen ? (
          <AddSerialsPanel
            state={extrasState}
            rows={availableSerials}
            pending={pending}
            selected={selected}
            onToggle={toggleSerial}
            onRetry={retryExtras}
            details={{
              options: checklistOptions,
              choices: extraChoices,
              onChange: updateExtraChoice,
            }}
          />
        ) : null}
        {canEditList && addedMissing.length > 0 ? (
          <p className="text-sm text-muted-foreground">{pulloutMissingDetailsText(addedMissing)}</p>
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
            {detail.condition ? <PulloutConditionBadge condition={detail.condition} /> : null}
          </span>
        }
        actions={
          <>
            {headerActions()}
            <ShipmentPrintButton document={printDocument} />
          </>
        }
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
      <AlertDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeReject();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Reject ${rejectTarget?.serialNo ?? "this unit"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Use this when the unit did not arrive or cannot be accepted. It goes back to ${detail.branch.name} as ${rejectTarget?.priorCode ?? "its original status"}. If it is lost, the next stock count shows it as missing.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={rejectRemarksId}>Reason for rejection</Label>
            <Textarea
              id={rejectRemarksId}
              value={rejectRemarks}
              maxLength={PULLOUT_REJECTION_REMARKS_MAX}
              onChange={(event) => setRejectRemarks(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!rejectRemarks.trim()} onClick={confirmReject}>
              Reject unit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
