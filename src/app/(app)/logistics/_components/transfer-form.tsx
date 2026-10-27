"use client";

import { Plus, Trash2 } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, useTransition } from "react";
import { toast } from "sonner";

import { LogisticsHistoryBody } from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { LogisticsShipmentSection } from "@/app/(app)/logistics/_components/logistics-shipment-section";
import { transferAuditLabel, TransferTracker } from "@/app/(app)/logistics/_components/transfer-tracker";
import {
  CompactLineTable,
  CompactModelCell,
  type CompactLineColumn,
} from "@/components/compact-line-table";
import { RecordFieldGrid, RecordReadout, RecordSection, RecordSheet } from "@/components/record-section";

import {
  approveTransferAction,
  executeTransferAction,
  saveTransferShipmentAction,
  listBranchesForLogisticsAction,
  listTransferModelsAction,
  listTransferSerialsAction,
  receiveTransferAction,
  rejectTransferAction,
  rejectTransferSerialAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import {
  asWorkflowCode,
  TRANSFER_WORKFLOW_CODE,
  workflowStatusLabel,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import {
  DIFFERENT_DEALER_GROUP_MESSAGE,
  sameDealerGroup,
} from "@/features/logistics/lib/transfer-dealer-group";
import { nextTransferNo } from "@/features/logistics/lib/transfer-number";
import { printTransferSlips } from "@/features/logistics/lib/transfer-slip-print";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";

export interface TransferCreateInput {
  fromBranchId: string;
  toBranchId: string;
  modelId: string;
  quantity: number;
  serialNumberIds: string[];
  notes?: string;
  transferNo?: string;
}

export interface TransferCreateState {
  pending: boolean;
  ready: boolean;
}

export type TransferDocumentAction = "approve" | "reject" | "release";

export interface TransferDocumentActions {
  canApprove: boolean;
  canReject: boolean;
  canRelease: boolean;
  pending: boolean;
}

export interface TransferFormHandle {
  openDocumentAction: (action: TransferDocumentAction) => void;
}

export const TRANSFER_CREATE_FORM_ID = "transfer-create-form";

interface TransferFormProps {
  mode: "create" | "view";
  currentUserName?: string;
  capabilities?: LogisticsActionCapabilities;
  branchScope?: string[] | null;
  detail?: TransferDetail | null;
  onSubmit?: (
    input: TransferCreateInput,
  ) => Promise<{ error?: string; transferNo?: string }>;
  onCreated?: () => void;
  onUpdated?: () => void;
  onCreateStateChange?: (state: TransferCreateState) => void;
  actionsPlacement?: "inline" | "external";
  onDocumentActionsChange?: (state: TransferDocumentActions) => void;
  /** Page detail hides the number and status, and puts each section on a card. */
  layout?: "form" | "page";
  workflowStatuses?: readonly WorkflowStatusOption[];
}

interface DraftRow {
  key: string;
  modelId: string;
  serialNumberId: string;
}

interface ModelOption {
  id: string;
  skuCode: string;
  name: string;
}

interface FreeSerial {
  serialNumberId: string;
  serialNo: string;
  inventoryCode: string;
}

type PendingConfirm =
  | { type: "approve" }
  | { type: "reject" }
  | { type: "release" }
  | { type: "receive"; serialNumberId: string; serialNo: string }
  | { type: "reject-serial"; serialNumberId: string; serialNo: string };

const APPROVE_NOTE =
  "Team Lead approval keeps the units reserved and sends the request to the releasing branch. Stock at the receiving branch does not increase.";
const REJECT_NOTE = "Rejected requests release only the units reserved on this transfer.";
const RELEASE_NOTE =
  "Release sends these units in transit. Stock at the receiving branch does not increase until they are accepted.";
const RECEIVE_NOTE =
  "This serial moves to the receiving branch as stock. Its delivery receipt number updates. The original delivery date stays the same.";
const REJECT_SERIAL_NOTE =
  "This serial stays at the releasing branch as stock. Say why it was rejected.";

const TRANSFER_DATE = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "Asia/Manila",
});

const POPOVER_CLASS = "z-[100]";
const SERIAL_POPOVER_CLASS = "z-[100] min-w-72";

let draftRowSeq = 0;

function nextDraftKey(): string {
  draftRowSeq += 1;
  return `draft-${draftRowSeq}`;
}

function emptyDraftRow(modelId = ""): DraftRow {
  return { key: nextDraftKey(), modelId, serialNumberId: "" };
}

function formatTransferDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return TRANSFER_DATE.format(date);
}

function inScope(scope: string[] | null, branchId: string): boolean {
  return scope === null || scope.includes(branchId);
}

function confirmTitle(confirm: PendingConfirm, transferNo: string): string {
  switch (confirm.type) {
    case "approve":
      return "Approve transfer?";
    case "reject":
      return "Reject transfer?";
    case "release":
      return "Release transfer?";
    case "receive":
      return `Accept ${confirm.serialNo} on ${transferNo}`;
    case "reject-serial":
      return `Reject ${confirm.serialNo} on ${transferNo}`;
    default: {
      const unreachable: never = confirm;
      return unreachable;
    }
  }
}

function confirmNote(type: PendingConfirm["type"]): string {
  switch (type) {
    case "approve":
      return APPROVE_NOTE;
    case "reject":
      return REJECT_NOTE;
    case "release":
      return RELEASE_NOTE;
    case "receive":
      return RECEIVE_NOTE;
    case "reject-serial":
      return REJECT_SERIAL_NOTE;
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
}

function successMessage(confirm: PendingConfirm): string {
  switch (confirm.type) {
    case "approve":
      return "Transfer approved for release";
    case "reject":
      return "Transfer rejected";
    case "release":
      return "Transfer released — units are in transit";
    case "receive":
      return "Serial accepted";
    case "reject-serial":
      return "Serial rejected";
    default: {
      const unreachable: never = confirm;
      return unreachable;
    }
  }
}

function modelLabel(model: { skuCode: string; name: string } | null | undefined): string {
  if (!model) return "—";
  return `${model.skuCode} — ${model.name}`;
}

type TransferLineRow = TransferDetail["lines"][number];

function lineCanBeDecided(line: TransferLineRow, fromBranchId: string | null): boolean {
  if (line.decision !== "pending") return false;
  const held = line.inventoryCode === "RSV" || line.inventoryCode === "DIT";
  return held && line.branchId === fromBranchId;
}

function transferLineColumns(
  fromBranchId: string | null,
  canReceive: boolean,
  pending: boolean,
  onAccept: (line: TransferLineRow) => void,
  onReject: (line: TransferLineRow) => void,
): CompactLineColumn<TransferLineRow>[] {
  const columns: CompactLineColumn<TransferLineRow>[] = [
    {
      id: "model",
      header: "Model",
      cell: (line) => <CompactModelCell code={line.skuCode} name={line.modelName} />,
    },
    {
      id: "serial",
      header: "Serial number",
      className: "w-48 font-mono",
      cell: (line) => line.serialNo,
    },
  ];
  if (!canReceive) return columns;
  columns.push({
    id: "action",
    header: "Action",
    align: "right",
    className: "w-44",
    cell: (line) => {
      if (line.decision === "accepted") {
        return <span className="text-xs text-emerald-700">Accepted</span>;
      }
      if (line.decision === "rejected") {
        return (
          <span className="text-xs text-destructive">
            Rejected{line.remarks ? ` — ${line.remarks}` : ""}
          </span>
        );
      }
      if (!lineCanBeDecided(line, fromBranchId)) return null;
      return (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => onAccept(line)}
          >
            Accept
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => onReject(line)}
          >
            Reject
          </Button>
        </div>
      );
    },
  });
  return columns;
}

function TransferLinesTable({
  lines,
  fromBranchId,
  canReceive,
  pending,
  onAccept,
  onReject,
  showHeading = true,
}: {
  lines: TransferLineRow[];
  fromBranchId: string | null;
  canReceive: boolean;
  pending: boolean;
  onAccept: (line: TransferLineRow) => void;
  onReject: (line: TransferLineRow) => void;
  showHeading?: boolean;
}) {
  return (
    <div>
      {showHeading ? (
        <div className="min-w-0">
          <p className="font-medium">Transfer details</p>
          <p className="text-xs text-muted-foreground">
            {lines.length} serial{lines.length === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}
      <CompactLineTable
        rows={lines}
        getRowId={(line) => line.serialNumberId}
        columns={transferLineColumns(fromBranchId, canReceive, pending, onAccept, onReject)}
        searchText={(line) => [line.skuCode, line.modelName, line.serialNo]}
        searchPlaceholder="Search serials…"
        itemLabel="serial"
        emptyMessage="No serials on this transfer."
        noMatchMessage="No matching serials."
        paginationInset={!showHeading}
      />
    </div>
  );
}

export function hasTransferDocumentAction(actions: TransferDocumentActions): boolean {
  return actions.canApprove || actions.canReject || actions.canRelease;
}

export function TransferDocumentActionButtons({
  actions,
  onAction,
}: {
  actions: TransferDocumentActions;
  onAction: (action: TransferDocumentAction) => void;
}) {
  const showRelease = actions.canRelease && !actions.canApprove;
  const showReject = actions.canReject && !showRelease;
  if (!actions.canApprove && !showRelease && !showReject) return null;
  return (
    <>
      {actions.canApprove ? (
        <Button type="button" disabled={actions.pending} onClick={() => onAction("approve")}>
          Approve
        </Button>
      ) : null}
      {showReject ? (
        <Button
          type="button"
          variant="outline"
          disabled={actions.pending}
          onClick={() => onAction("reject")}
        >
          Reject
        </Button>
      ) : null}
      {showRelease ? (
        <Button type="button" disabled={actions.pending} onClick={() => onAction("release")}>
          Release
        </Button>
      ) : null}
    </>
  );
}

type TransferWorkspaceKind =
  | "waiting"
  | "release"
  | "transit"
  | "accepted"
  | "stopped"
  | "recorded";

function transferWorkspaceKind(code: string): TransferWorkspaceKind {
  const known = asWorkflowCode(TRANSFER_WORKFLOW_CODE, code);
  if (!known) return "recorded";
  switch (known) {
    case TRANSFER_WORKFLOW_CODE.pending_tl:
    case TRANSFER_WORKFLOW_CODE.requested:
      return "waiting";
    case TRANSFER_WORKFLOW_CODE.for_transfer:
    case TRANSFER_WORKFLOW_CODE.approved:
      return "release";
    case TRANSFER_WORKFLOW_CODE.in_transit:
      return "transit";
    case TRANSFER_WORKFLOW_CODE.accepted:
      return "accepted";
    case TRANSFER_WORKFLOW_CODE.rejected:
    case TRANSFER_WORKFLOW_CODE.cancelled:
      return "stopped";
    case TRANSFER_WORKFLOW_CODE.draft:
    case TRANSFER_WORKFLOW_CODE.completed:
      return "recorded";
    default: {
      const unreachable: never = known;
      return unreachable;
    }
  }
}

function workspaceDescription(kind: TransferWorkspaceKind): string {
  switch (kind) {
    case "waiting":
      return "Review the releasing branch, receiving branch, model, and serials.";
    case "release":
      return "These units are approved and ready to leave the releasing branch.";
    case "transit":
      return "Accept each serial that has arrived.";
    case "accepted":
      return "These units were accepted at the receiving branch.";
    case "stopped":
      return "This transfer is closed. The branches, model, and serials stay here for reference.";
    case "recorded":
      return "Releasing branch, receiving branch, model, and serials.";
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function showsBranches(kind: TransferWorkspaceKind): boolean {
  switch (kind) {
    case "waiting":
    case "release":
    case "accepted":
    case "stopped":
    case "recorded":
      return true;
    case "transit":
      return false;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function showsModel(kind: TransferWorkspaceKind): boolean {
  switch (kind) {
    case "waiting":
    case "release":
    case "stopped":
    case "recorded":
      return true;
    case "transit":
    case "accepted":
      return false;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function showsOnTheWay(kind: TransferWorkspaceKind): boolean {
  switch (kind) {
    case "transit":
      return true;
    case "waiting":
    case "release":
    case "accepted":
    case "stopped":
    case "recorded":
      return false;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function serialsStillOnTheWay(detail: TransferDetail): number {
  return detail.lines.filter(
    (line) => line.inventoryCode === "DIT" && line.branchId === detail.fromBranch.id,
  ).length;
}

function onTheWayLine(count: number): string {
  if (count === 1) return "1 serial is still on the way.";
  return `${count} serials are still on the way.`;
}

function TransferPageWorkspace({
  detail,
  canReceive,
  canEditShipment,
  pending,
  workflowStatuses,
  onAccept,
  onReject,
  onPrintSlips,
  onShipmentSaved,
}: {
  detail: TransferDetail;
  canReceive: boolean;
  canEditShipment: boolean;
  pending: boolean;
  workflowStatuses: readonly WorkflowStatusOption[];
  onAccept: (line: TransferLineRow) => void;
  onReject: (line: TransferLineRow) => void;
  onPrintSlips: (() => void) | null;
  onShipmentSaved: () => void;
}) {
  const kind = transferWorkspaceKind(detail.status.code);
  const remarks = detail.notes?.trim() ?? "";

  return (
    <RecordSheet>
      <RecordSection title="Progress">
        <TransferTracker
          status={detail.status}
          history={detail.history}
          catalog={workflowStatuses}
        />
      </RecordSection>
      <RecordSection
        title={workflowStatusLabel(detail.status)}
        description={workspaceDescription(kind)}
        divided
      >
        {showsBranches(kind) ? (
          <RecordFieldGrid>
            <RecordReadout label="Releasing branch" value={detail.fromBranch.name} />
            <RecordReadout label="Receiving branch" value={detail.toBranch.name} />
            {showsModel(kind) ? (
              <RecordReadout label="Model" value={modelLabel(detail.model)} wide />
            ) : null}
            {remarks ? <RecordReadout label="Remarks" value={remarks} wide multiline /> : null}
          </RecordFieldGrid>
        ) : remarks ? (
          <RecordReadout label="Remarks" value={remarks} wide multiline />
        ) : null}
        {showsOnTheWay(kind) ? (
          <p className="text-sm">{onTheWayLine(serialsStillOnTheWay(detail))}</p>
        ) : null}
      </RecordSection>
      <LogisticsShipmentSection
        key={`${detail.shipment.waybillNo ?? ""}|${detail.shipment.courierName ?? ""}|${detail.shipment.scheduledAt ?? ""}`}
        shipment={detail.shipment}
        canEdit={canEditShipment}
        onSave={async (input) => {
          const result = await saveTransferShipmentAction(detail.id, input);
          if ("success" in result && result.success) onShipmentSaved();
          return result;
        }}
      />
      <RecordSection title="Units" description="Serials on this transfer." divided>
        {onPrintSlips ? (
          <div className="mb-3 flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={onPrintSlips}>
              Print release slip and delivery receipt
            </Button>
          </div>
        ) : null}
        <TransferLinesTable
          lines={detail.lines}
          fromBranchId={detail.fromBranch.id}
          canReceive={canReceive}
          pending={pending}
          onAccept={onAccept}
          onReject={onReject}
          showHeading={false}
        />
      </RecordSection>
      <RecordSection title="History" divided>
        <LogisticsHistoryBody
          items={detail.history.map((row) => ({
            id: row.id,
            label: transferAuditLabel(row.action),
            actor: row.userName,
            at: row.at,
          }))}
        />
      </RecordSection>
    </RecordSheet>
  );
}

export const TransferForm = forwardRef<TransferFormHandle, TransferFormProps>(
  function TransferForm(
    {
      mode,
      currentUserName = "",
      capabilities,
      branchScope = null,
      detail = null,
      onSubmit,
      onCreated,
      onUpdated,
      onCreateStateChange,
      actionsPlacement = "inline",
      onDocumentActionsChange,
      layout = "form",
      workflowStatuses = [],
    },
    ref,
  ) {
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string; dealerId: string | null }[]>([]);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [modelSnapshot, setModelSnapshot] = useState<{ source: string; models: ModelOption[] }>({
    source: "",
    models: [],
  });
  const [serialSnapshot, setSerialSnapshot] = useState<{ source: string; serials: FreeSerial[] }>({
    source: "",
    serials: [],
  });
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [rows, setRows] = useState<DraftRow[]>(() => [emptyDraftRow()]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState("");
  const [createdOn] = useState(() => formatTransferDate(new Date()));
  const [draftTransferNo] = useState(() => (mode === "create" ? nextTransferNo() : ""));
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const lockedModelId = rows[0]?.modelId ?? "";
  const serialSource =
    mode === "create" && fromBranchId && lockedModelId ? `${fromBranchId}:${lockedModelId}` : "";
  const models = modelSnapshot.source === fromBranchId ? modelSnapshot.models : [];
  const modelsLoading = mode === "create" && Boolean(fromBranchId) && modelSnapshot.source !== fromBranchId;
  const serials = serialSnapshot.source === serialSource ? serialSnapshot.serials : [];
  const serialsLoading = Boolean(serialSource) && serialSnapshot.source !== serialSource;

  useEffect(() => {
    if (mode !== "create") return;
    let cancelled = false;
    void listBranchesForLogisticsAction().then((branchRows) => {
      if (cancelled) return;
      setBranches(branchRows);
      const preferredFrom = branchRows.find((branch) => inScope(branchScope, branch.id));
      const sameDealer = branchRows.find(
        (branch) =>
          branch.id !== preferredFrom?.id &&
          sameDealerGroup(preferredFrom?.dealerId, branch.dealerId),
      );
      setFromBranchId((current) => current || preferredFrom?.id || "");
      setToBranchId((current) => current || sameDealer?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, branchScope]);

  useEffect(() => {
    if (mode !== "create" || !fromBranchId) return;
    const source = fromBranchId;
    let cancelled = false;
    void listTransferModelsAction(fromBranchId).then((result) => {
      if (cancelled) return;
      if ("error" in result && result.error) {
        setModelSnapshot({ source, models: [] });
        toast.error(result.error);
        return;
      }
      if (!("models" in result)) return;
      setModelSnapshot({ source, models: result.models });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fromBranchId]);

  useEffect(() => {
    if (mode !== "create" || !fromBranchId || !lockedModelId) return;
    const source = `${fromBranchId}:${lockedModelId}`;
    let cancelled = false;
    void listTransferSerialsAction(fromBranchId, lockedModelId).then((result) => {
      if (cancelled) return;
      if ("error" in result && result.error) {
        setSerialSnapshot({ source, serials: [] });
        toast.error(result.error);
        return;
      }
      if (!("serials" in result)) return;
      const nextSerials = result.serials;
      setSerialSnapshot({ source, serials: nextSerials });
      setRows((current) =>
        current.map((row) =>
          nextSerials.some((serial) => serial.serialNumberId === row.serialNumberId)
            ? row
            : { ...row, serialNumberId: "" },
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fromBranchId, lockedModelId]);

  const hasLines = Boolean(detail && detail.lines.length > 0);
  const waiting =
    detail?.status.code === TRANSFER_WORKFLOW_CODE.pending_tl ||
    detail?.status.code === TRANSFER_WORKFLOW_CODE.requested;
  const releasable =
    detail?.status.code === TRANSFER_WORKFLOW_CODE.for_transfer ||
    detail?.status.code === TRANSFER_WORKFLOW_CODE.approved;
  const canApprove = Boolean(
    hasLines &&
      waiting &&
      detail &&
      capabilities?.canApproveTl &&
      inScope(branchScope, detail.fromBranch.id),
  );
  const canReject = Boolean(
    waiting &&
      detail &&
      capabilities?.canRejectTransfer &&
      inScope(branchScope, detail.fromBranch.id),
  );
  const canRelease = Boolean(
    hasLines &&
      detail &&
      releasable &&
      capabilities?.canExecuteTransfer &&
      inScope(branchScope, detail.fromBranch.id),
  );
  const receivable =
    detail?.status.code === TRANSFER_WORKFLOW_CODE.for_transfer ||
    detail?.status.code === TRANSFER_WORKFLOW_CODE.approved ||
    detail?.status.code === TRANSFER_WORKFLOW_CODE.in_transit;
  const canReceive = Boolean(
    hasLines &&
      detail &&
      receivable &&
      (capabilities?.canReceiveTransfer || capabilities?.canApproveTl) &&
      inScope(branchScope, detail.toBranch.id),
  );
  const dealersMatch = sameDealerGroup(
    branches.find((branch) => branch.id === fromBranchId)?.dealerId,
    branches.find((branch) => branch.id === toBranchId)?.dealerId,
  );
  const shipmentClosed =
    detail?.status.code === TRANSFER_WORKFLOW_CODE.rejected ||
    detail?.status.code === TRANSFER_WORKFLOW_CODE.cancelled;
  const canEditShipment = Boolean(detail && capabilities?.canManage && !shipmentClosed);
  const documentActions: TransferDocumentActions = {
    canApprove,
    canReject,
    canRelease,
    pending,
  };
  const selectedCount = rows.filter((row) => selectedKeys.has(row.key)).length;
  const allRowsSelected = rows.length > 0 && selectedCount === rows.length;
  const selectedIds = rows.map((row) => row.serialNumberId).filter(Boolean);
  const ready =
    mode === "create" &&
    Boolean(onSubmit) &&
    Boolean(lockedModelId) &&
    Boolean(fromBranchId) &&
    Boolean(toBranchId) &&
    fromBranchId !== toBranchId &&
    dealersMatch &&
    rows.length > 0 &&
    rows.every((row) => row.serialNumberId) &&
    new Set(selectedIds).size === selectedIds.length &&
    !serialsLoading;
  const canAddRow =
    mode === "create" &&
    Boolean(lockedModelId) &&
    !serialsLoading &&
    rows.every((row) => row.serialNumberId) &&
    selectedIds.length < serials.length;

  function warnIfDifferentDealer(fromId: string, toId: string) {
    const from = branches.find((branch) => branch.id === fromId);
    const to = branches.find((branch) => branch.id === toId);
    if (!from || !to || from.id === to.id) return;
    if (!sameDealerGroup(from.dealerId, to.dealerId)) {
      toast.error(DIFFERENT_DEALER_GROUP_MESSAGE);
    }
  }

  function resetDraft(nextFrom = "") {
    setFromBranchId(nextFrom);
    setModelSnapshot({ source: "", models: [] });
    setSerialSnapshot({ source: "", serials: [] });
    setRows([emptyDraftRow()]);
    setSelectedKeys(new Set());
    warnIfDifferentDealer(nextFrom, toBranchId);
  }

  function chooseReceiveBranch(nextTo: string) {
    setToBranchId(nextTo);
    warnIfDifferentDealer(fromBranchId, nextTo);
  }

  function setFirstModel(modelId: string) {
    setRows((current) => current.map((row) => ({ ...row, modelId, serialNumberId: "" })));
  }

  function setRowSerial(key: string, serialNumberId: string) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, serialNumberId } : row)),
    );
  }

  function addRow() {
    if (!canAddRow) return;
    setRows((current) => [...current, emptyDraftRow(current[0]?.modelId ?? "")]);
  }

  function toggleAll(on: boolean) {
    setSelectedKeys(on ? new Set(rows.map((row) => row.key)) : new Set());
  }

  function toggleRow(key: string, on: boolean) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function removeKeys(keys: Set<string>) {
    if (keys.size === 0) return;
    setSelectedKeys((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.delete(key));
      return next;
    });
    setRows((current) => {
      const next = current.filter((row) => !keys.has(row.key));
      if (next.length === 0) return [emptyDraftRow()];
      const modelId = next[0]?.modelId ?? "";
      return next.map((row) => ({ ...row, modelId }));
    });
  }

  function removeRow(key: string) {
    removeKeys(new Set([key]));
  }

  function removeSelected() {
    removeKeys(new Set(rows.filter((row) => selectedKeys.has(row.key)).map((row) => row.key)));
  }

  function submit() {
    if (!ready || !onSubmit) return;
    const serialNumberIds = rows.map((row) => row.serialNumberId);
    startTransition(async () => {
      const result = await onSubmit({
        fromBranchId,
        toBranchId,
        modelId: lockedModelId,
        quantity: rows.length,
        serialNumberIds,
        notes: notes.trim() || undefined,
        transferNo: draftTransferNo,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.transferNo ? `Transfer ${result.transferNo} submitted` : "Transfer submitted",
      );
      onCreated?.();
    });
  }

  function runConfirmed() {
    if (!pendingConfirm || mode !== "view" || !detail) return;
    const action = pendingConfirm;
    startTransition(async () => {
      const result = await runTransferAction(detail.id, action, rejectRemarks);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      const slip = action.type === "approve" ? approvedSlip(result) : null;
      if (slip) {
        const opened = printTransferSlips({
          transferNo: slip.transferNo || detail.transferNo,
          rsNo: slip.rsNo,
          drNo: slip.drNo,
          fromBranch: detail.fromBranch.name,
          toBranch: detail.toBranch.name,
          lines: detail.lines.map((line) => ({
            serialNo: line.serialNo,
            model: modelLabel({ skuCode: line.skuCode, name: line.modelName }),
          })),
        });
        if (!opened) {
          toast.message("Release slip and delivery receipt are ready to print");
        }
      }
      toast.success(successMessage(action));
      setPendingConfirm(null);
      onUpdated?.();
    });
  }

  const transferNo = mode === "view" ? (detail?.transferNo ?? "") : draftTransferNo;

  const openDocumentAction = useCallback(
    (action: TransferDocumentAction) => {
      switch (action) {
        case "approve":
          if (!canApprove) return;
          setPendingConfirm({ type: "approve" });
          return;
        case "reject":
          if (!canReject) return;
          setPendingConfirm({ type: "reject" });
          return;
        case "release":
          if (!canRelease) return;
          setPendingConfirm({ type: "release" });
          return;
        default: {
          const unreachable: never = action;
          return unreachable;
        }
      }
    },
    [canApprove, canReject, canRelease],
  );

  useImperativeHandle(ref, () => ({ openDocumentAction }), [openDocumentAction]);

  useEffect(() => {
    if (mode !== "create") return;
    onCreateStateChange?.({ pending, ready });
  }, [mode, onCreateStateChange, pending, ready]);

  useEffect(() => {
    if (mode !== "view") return;
    onDocumentActionsChange?.({ canApprove, canReject, canRelease, pending });
  }, [mode, onDocumentActionsChange, canApprove, canReject, canRelease, pending]);

  const createdBy = mode === "view" ? (detail?.createdBy ?? "—") : currentUserName || "—";
  const createdDate =
    mode === "view" && detail?.createdAt ? formatTransferDate(detail.createdAt) : createdOn;
  const route =
    detail ? `${detail.fromBranch.name} → ${detail.toBranch.name}` : "";
  const pageLayout = layout === "page" && mode === "view";
  const branchFields = (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {pageLayout ? null : (
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Transfer No.</dt>
          <dd className="mt-1 text-sm font-medium">{transferNo || "—"}</dd>
        </div>
      )}
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">
          {mode === "create" ? (
            <label htmlFor="transfer-from-branch">Branch Release</label>
          ) : (
            "Branch Release"
          )}
        </dt>
        <dd className="mt-1 text-sm font-medium">
          {mode === "create" ? (
            <SearchableSelect
              id="transfer-from-branch"
              options={branches
                .filter((branch) => inScope(branchScope, branch.id))
                .map((branch) => ({ id: branch.id, label: branch.name }))}
              value={fromBranchId}
              onChange={(next) => resetDraft(next)}
              placeholder="Select branch…"
              searchPlaceholder="Search branches…"
              disabled={pending}
              popoverClassName={POPOVER_CLASS}
            />
          ) : (
            (detail?.fromBranch.name ?? "—")
          )}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">Created By</dt>
        <dd className="mt-1 text-sm font-medium">{createdBy}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">
          {mode === "create" ? (
            <label htmlFor="transfer-to-branch">Branch Receive</label>
          ) : (
            "Branch Receive"
          )}
        </dt>
        <dd className="mt-1 text-sm font-medium">
          {mode === "create" ? (
            <SearchableSelect
              id="transfer-to-branch"
              options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
              value={toBranchId}
              onChange={chooseReceiveBranch}
              placeholder="Select branch…"
              searchPlaceholder="Search branches…"
              disabled={pending}
              popoverClassName={POPOVER_CLASS}
            />
          ) : (
            (detail?.toBranch.name ?? "—")
          )}
          {mode === "create" && fromBranchId && toBranchId && !dealersMatch ? (
            <p className="mt-1 text-xs text-destructive">{DIFFERENT_DEALER_GROUP_MESSAGE}</p>
          ) : null}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">Created Date</dt>
        <dd className="mt-1 text-sm font-medium">{createdDate || "—"}</dd>
      </div>
      {pageLayout ? null : (
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Transfer Status</dt>
          <dd className="mt-1 text-sm font-medium">
            {mode === "view" && detail ? (
              <StatusCodeBadge
                code={detail.status.code}
                name={detail.status.name}
                color={detail.status.color}
              />
            ) : (
              "New"
            )}
          </dd>
        </div>
      )}
    </dl>
  );

  return (
    <form
      id={mode === "create" ? TRANSFER_CREATE_FORM_ID : undefined}
      className={pageLayout ? "space-y-6" : "space-y-4"}
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "create") submit();
      }}
    >
      {pageLayout && detail ? (
        <TransferPageWorkspace
          detail={detail}
          canReceive={canReceive}
          canEditShipment={canEditShipment}
          pending={pending}
          workflowStatuses={workflowStatuses}
          onShipmentSaved={() => onUpdated?.()}
          onPrintSlips={detail.rsNo && detail.drNo ? () => printCurrentSlips(detail) : null}
          onAccept={(line) =>
            setPendingConfirm({
              type: "receive",
              serialNumberId: line.serialNumberId,
              serialNo: line.serialNo,
            })
          }
          onReject={(line) => {
            setRejectRemarks("");
            setPendingConfirm({
              type: "reject-serial",
              serialNumberId: line.serialNumberId,
              serialNo: line.serialNo,
            });
          }}
        />
      ) : (
        <>
        <section>{branchFields}</section>

      <section className="space-y-2">
        {mode === "create" ? <h3 className="font-medium">Transfer details</h3> : null}
        {mode === "view" ? (
          <TransferLinesTable
            lines={detail?.lines ?? []}
            fromBranchId={detail?.fromBranch.id ?? null}
            canReceive={canReceive}
            pending={pending}
            onAccept={(line) =>
              setPendingConfirm({
                type: "receive",
                serialNumberId: line.serialNumberId,
                serialNo: line.serialNo,
              })
            }
            onReject={(line) => {
              setRejectRemarks("");
              setPendingConfirm({
                type: "reject-serial",
                serialNumberId: line.serialNumberId,
                serialNo: line.serialNo,
              });
            }}
          />
        ) : (
        <div className="min-w-0 overflow-hidden rounded-md border">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th
                  className="w-10 px-2 py-2 align-middle font-medium text-muted-foreground"
                  scope="col"
                >
                  #
                </th>
                <th className="w-10 px-2 py-2 align-middle" scope="col">
                  <Checkbox
                    checked={allRowsSelected || (selectedCount > 0 ? "indeterminate" : false)}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    disabled={pending}
                    aria-label="Select all serials"
                  />
                </th>
                <th className="px-2 py-2 align-middle font-medium text-muted-foreground" scope="col">
                  Model
                </th>
                <th className="px-2 py-2 align-middle font-medium text-muted-foreground" scope="col">
                  Serial number
                </th>
                <th
                  className="w-40 px-2 py-2 align-middle font-medium text-muted-foreground"
                  scope="col"
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span>Action</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="size-8 shrink-0 p-0"
                      disabled={pending || !canAddRow}
                      onClick={addRow}
                      aria-label="Add serial"
                      title="Add serial"
                    >
                      <Plus />
                    </Button>
                    {allRowsSelected ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-destructive hover:text-destructive"
                        disabled={pending}
                        onClick={removeSelected}
                        aria-label="Delete selected serials"
                        title="Delete selected serials"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
            {rows.map((row, index) => {
                  const taken = new Set(
                    rows
                      .filter((other) => other.key !== row.key && other.serialNumberId)
                      .map((other) => other.serialNumberId),
                  );
                  const serialOptions = serials
                    .filter(
                      (serial) =>
                        serial.serialNumberId === row.serialNumberId ||
                        !taken.has(serial.serialNumberId),
                    )
                    .map((serial) => ({
                      id: serial.serialNumberId,
                      label: serial.serialNo,
                      description: serial.inventoryCode,
                    }));
                  return (
                    <tr key={row.key} className="border-t">
                      <td className="px-2 py-2 align-middle tabular-nums text-muted-foreground">
                        {index + 1}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <Checkbox
                          checked={selectedKeys.has(row.key)}
                          onCheckedChange={(checked) => toggleRow(row.key, checked === true)}
                          disabled={pending}
                          aria-label={`Select serial ${index + 1}`}
                        />
                      </td>
                      <td className="min-w-0 overflow-hidden px-2 py-2 align-middle">
                        <SearchableSelect
                          options={models.map((model) => ({
                            id: model.id,
                            label: modelLabel(model),
                          }))}
                          value={index === 0 ? row.modelId : lockedModelId}
                          onChange={index === 0 ? setFirstModel : () => undefined}
                          placeholder={modelsLoading ? "Loading models…" : "Select model…"}
                          searchPlaceholder="Search models…"
                          emptyMessage="No free serials for a model at this branch."
                          disabled={pending || index > 0 || modelsLoading || models.length === 0}
                          popoverClassName={POPOVER_CLASS}
                        />
                      </td>
                      <td className="min-w-0 overflow-hidden px-2 py-2 align-middle">
                        <SearchableSelect
                          options={serialOptions}
                          value={row.serialNumberId}
                          onChange={(next) => setRowSerial(row.key, next)}
                          placeholder={
                            !lockedModelId
                              ? "Select a model first…"
                              : serialsLoading
                                ? "Loading serials…"
                                : "Select serial…"
                          }
                          searchPlaceholder="Search serials…"
                          emptyMessage="No stock or defective serials are free for this model."
                          disabled={pending || !lockedModelId || serialsLoading || serials.length === 0}
                          popoverClassName={SERIAL_POPOVER_CLASS}
                        />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          disabled={pending}
                          onClick={() => removeRow(row.key)}
                          aria-label={`Remove serial row ${index + 1}`}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        )}

        {mode === "view" && actionsPlacement === "inline" && hasTransferDocumentAction(documentActions) ? (
          <div className="flex justify-end gap-2">
            <TransferDocumentActionButtons actions={documentActions} onAction={openDocumentAction} />
          </div>
        ) : null}

        {mode === "create" && fromBranchId && toBranchId && fromBranchId === toBranchId ? (
          <p className="text-sm text-muted-foreground">
            Releasing and receiving branches must be different.
          </p>
        ) : null}
        {mode === "create" && fromBranchId && !modelsLoading && models.length === 0 ? (
          <p
            role="status"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            No stock or defective serials are free at this branch.
          </p>
        ) : null}
        {mode === "create" && lockedModelId && !serialsLoading && serials.length === 0 ? (
          <p
            role="status"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            No stock or defective serials are free for this model.
          </p>
        ) : null}
        {pageLayout ? null : (
        <div className="space-y-1.5">
          <label htmlFor="transfer-remarks" className="text-sm text-muted-foreground">
            Remarks
          </label>
          {mode === "create" ? (
            <Textarea
              id="transfer-remarks"
              value={notes}
              disabled={pending}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Why these units are moving"
              rows={1}
              className="h-9 min-h-9 resize-none py-1.5"
            />
          ) : (
            <p id="transfer-remarks" className="text-sm whitespace-pre-wrap">
              {detail?.notes?.trim() ? (
                detail.notes
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          )}
        </div>
        )}
      </section>

      {mode === "view" && detail ? (
          <section className="space-y-2">
            <h3 className="font-medium">History</h3>
            {detail.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {detail.history.map((row) => (
                  <li key={row.id}>
                    {transferAuditLabel(row.action)}
                    {row.userName ? ` · ${row.userName}` : ""} ·{" "}
                    {new Date(row.at).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </section>
      ) : null}
        </>
      )}

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent className="z-[80]" overlayClassName="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm ? confirmTitle(pendingConfirm, transferNo) : "Confirm"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm?.type === "receive" ? (
                <>
                  Serial{" "}
                  <span className="font-mono text-foreground">{pendingConfirm.serialNo}</span>.{" "}
                  {RECEIVE_NOTE}
                </>
              ) : pendingConfirm ? (
                <>
                  Transfer <span className="font-medium text-foreground">{transferNo}</span>
                  {route ? ` (${route}). ` : ". "}
                  {confirmNote(pendingConfirm.type)}
                </>
              ) : (
                "Confirm this transfer action."
              )}
            </AlertDialogDescription>
            {pendingConfirm?.type === "reject-serial" ? (
              <Textarea
                value={rejectRemarks}
                onChange={(event) => setRejectRemarks(event.target.value)}
                placeholder="Why was this serial rejected?"
                maxLength={500}
                className="mt-3"
              />
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                pending ||
                (pendingConfirm?.type === "reject-serial" && rejectRemarks.trim().length === 0)
              }
              onClick={(event) => {
                event.preventDefault();
                runConfirmed();
              }}
            >
              {pendingConfirm?.type === "receive"
                ? "Accept"
                : pendingConfirm?.type === "reject-serial"
                  ? "Reject"
                  : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
  },
);

function approvedSlip(result: object): { rsNo: string; drNo: string; transferNo: string } | null {
  const row = result as { rsNo?: unknown; drNo?: unknown; transferNo?: unknown };
  if (typeof row.rsNo !== "string" || typeof row.drNo !== "string") return null;
  return {
    rsNo: row.rsNo,
    drNo: row.drNo,
    transferNo: typeof row.transferNo === "string" ? row.transferNo : "",
  };
}

function printCurrentSlips(detail: TransferDetail) {
  if (!detail.rsNo || !detail.drNo) return;
  const opened = printTransferSlips({
    transferNo: detail.transferNo,
    rsNo: detail.rsNo,
    drNo: detail.drNo,
    fromBranch: detail.fromBranch.name,
    toBranch: detail.toBranch.name,
    lines: detail.lines.map((line) => ({
      serialNo: line.serialNo,
      model: modelLabel({ skuCode: line.skuCode, name: line.modelName }),
    })),
  });
  if (!opened) toast.message("Release slip and delivery receipt are ready to print");
}

function runTransferAction(id: string, action: PendingConfirm, remarks: string) {
  switch (action.type) {
    case "approve":
      return approveTransferAction(id);
    case "reject":
      return rejectTransferAction(id);
    case "release":
      return executeTransferAction(id);
    case "receive":
      return receiveTransferAction(id, { serialNumberIds: [action.serialNumberId] });
    case "reject-serial":
      return rejectTransferSerialAction(id, {
        serialNumberId: action.serialNumberId,
        remarks,
      });
    default: {
      const unreachable: never = action;
      throw unreachable;
    }
  }
}
