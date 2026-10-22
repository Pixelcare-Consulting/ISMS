"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  approveTransferAction,
  executeTransferAction,
  listBranchesForLogisticsAction,
  listTransferModelsAction,
  listTransferSerialsAction,
  receiveTransferAction,
  rejectTransferAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import { nextTransferNo } from "@/features/logistics/lib/transfer-number";
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
  | { type: "receive"; serialNumberId: string; serialNo: string };

const APPROVE_NOTE =
  "Team Lead approval keeps the units reserved and sends the request to the releasing branch. Stock at the receiving branch does not increase.";
const REJECT_NOTE = "Rejected requests release only the units reserved on this transfer.";
const RELEASE_NOTE =
  "Release sends these units in transit. Stock at the receiving branch does not increase until they are accepted.";
const RECEIVE_NOTE =
  "Tick only the serials that arrived. The rest stay in transit, and this transfer stays in transit until every serial is received.";

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

function historyLabel(action: string): string {
  switch (action) {
    case "transfer.created":
      return "Request submitted";
    case "transfer.approved":
      return "Approved by Team Lead";
    case "transfer.rejected":
      return "Rejected";
    case "transfer.released":
      return "Released — in transit";
    case "transfer.received":
      return "Units received";
    default:
      return action;
  }
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
      return `Receive ${transferNo}`;
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
      return "Received the serials you confirmed";
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
      {showReject ? (
        <Button
          type="button"
          variant="outline"
          disabled={actions.pending}
          onClick={() => onAction("reject")}
        >
          Del
        </Button>
      ) : null}
      {actions.canApprove ? (
        <Button type="button" disabled={actions.pending} onClick={() => onAction("approve")}>
          Approve
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

function ModelSummary({ skuCode, name }: { skuCode: string; name: string }) {
  const title = name ? `${skuCode} — ${name}` : skuCode;
  return (
    <div className="w-56 max-w-full min-w-0" title={title}>
      <p className="truncate">{skuCode}</p>
      {name ? <p className="truncate text-xs text-muted-foreground">{name}</p> : null}
    </div>
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
    },
    ref,
  ) {
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
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
      setFromBranchId((current) => current || branchRows[0]?.id || "");
      setToBranchId((current) => current || branchRows[1]?.id || branchRows[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

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
    detail?.status.code === "pending_tl" || detail?.status.code === "requested";
  const releasable =
    detail?.status.code === "for_transfer" || detail?.status.code === "approved";
  const canApprove = Boolean(hasLines && waiting && capabilities?.canApproveTl);
  const canReject = Boolean(waiting && capabilities?.canRejectTransfer);
  const canRelease = Boolean(
    hasLines &&
      detail &&
      releasable &&
      capabilities?.canExecuteTransfer &&
      inScope(branchScope, detail.fromBranch.id),
  );
  const canReceive = Boolean(
    hasLines &&
      detail &&
      detail.status.code === "in_transit" &&
      capabilities?.canReceiveTransfer &&
      inScope(branchScope, detail.toBranch.id),
  );
  const documentActions: TransferDocumentActions = {
    canApprove,
    canReject,
    canRelease,
    pending,
  };
  const viewRows =
    mode === "view"
      ? detail && detail.lines.length > 0
        ? detail.lines
        : [null]
      : [];
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

  function resetDraft(nextFrom = "") {
    setFromBranchId(nextFrom);
    setModelSnapshot({ source: "", models: [] });
    setSerialSnapshot({ source: "", serials: [] });
    setRows([emptyDraftRow()]);
    setSelectedKeys(new Set());
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
      const result = await runTransferAction(detail.id, action);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
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

  return (
    <form
      id={mode === "create" ? TRANSFER_CREATE_FORM_ID : undefined}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "create") submit();
      }}
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">Transfer No.</dt>
          <dd className="text-sm">{transferNo || "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">
            {mode === "create" ? (
              <label htmlFor="transfer-from-branch">Branch Release</label>
            ) : (
              "Branch Release"
            )}
          </dt>
          <dd className="text-sm">
            {mode === "create" ? (
              <SearchableSelect
                id="transfer-from-branch"
                options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
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
          <dt className="text-sm text-muted-foreground">Created By</dt>
          <dd className="text-sm">{createdBy}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">
            {mode === "create" ? (
              <label htmlFor="transfer-to-branch">Branch Receive</label>
            ) : (
              "Branch Receive"
            )}
          </dt>
          <dd className="text-sm">
            {mode === "create" ? (
              <SearchableSelect
                id="transfer-to-branch"
                options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
                value={toBranchId}
                onChange={setToBranchId}
                placeholder="Select branch…"
                searchPlaceholder="Search branches…"
                disabled={pending}
                popoverClassName={POPOVER_CLASS}
              />
            ) : (
              (detail?.toBranch.name ?? "—")
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">Created Date</dt>
          <dd className="text-sm">{createdDate || "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">Transfer Status</dt>
          <dd className="text-sm">
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
      </dl>

      <section className="space-y-2">
        <h3 className="font-medium">Transfer details</h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th
                  className="w-12 px-3 py-2 align-middle font-medium text-muted-foreground"
                  scope="col"
                >
                  #
                </th>
                {mode === "create" ? (
                  <th className="w-10 px-3 py-2 align-middle" scope="col">
                    <Checkbox
                      checked={allRowsSelected || (selectedCount > 0 ? "indeterminate" : false)}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      disabled={pending}
                      aria-label="Select all serials"
                    />
                  </th>
                ) : null}
                <th className="w-[34%] px-3 py-2 align-middle font-medium text-muted-foreground" scope="col">
                  Model
                </th>
                <th
                  className="w-[50%] min-w-[18rem] px-3 py-2 align-middle font-medium text-muted-foreground"
                  scope="col"
                >
                  Serial number
                </th>
                {mode === "create" || canReceive ? (
                  <th className="px-3 py-2 align-middle font-medium text-muted-foreground" scope="col">
                    {mode === "create" ? (
                      <div className="flex items-center gap-1.5">
                        <span>Action</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="size-8 p-0"
                          disabled={pending || !canAddRow}
                          onClick={addRow}
                          aria-label="Add serial"
                          title="Add serial"
                        >
                          <Plus />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending || selectedCount === 0}
                          onClick={removeSelected}
                          aria-label="Delete selected serials"
                          title="Delete selected serials"
                        >
                          Del
                        </Button>
                      </div>
                    ) : (
                      "Action"
                    )}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
            {mode === "create"
              ? rows.map((row, index) => {
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
                      <td className="px-3 py-2 align-middle tabular-nums text-muted-foreground">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <Checkbox
                          checked={selectedKeys.has(row.key)}
                          onCheckedChange={(checked) => toggleRow(row.key, checked === true)}
                          disabled={pending}
                          aria-label={`Select serial ${index + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
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
                      <td className="min-w-[18rem] px-3 py-2 align-middle">
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
                      <td className="px-3 py-2 align-middle">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => removeRow(row.key)}
                          aria-label={`Remove serial row ${index + 1}`}
                        >
                          Del
                        </Button>
                      </td>
                    </tr>
                  );
                })
              : viewRows.map((line, index) => {
                  const inTransit = Boolean(
                    line &&
                      detail &&
                      line.inventoryCode === "DIT" &&
                      line.branchId === detail.fromBranch.id,
                  );
                  return (
                    <tr key={line?.serialNumberId ?? "empty"} className="border-t">
                      <td className="px-3 py-2 align-middle tabular-nums text-muted-foreground">
                        {line ? index + 1 : "—"}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {line ? (
                          <ModelSummary skuCode={line.skuCode} name={line.modelName} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td
                        className={
                          line
                            ? "min-w-[18rem] whitespace-nowrap px-3 py-2 align-middle font-mono"
                            : "min-w-[18rem] px-3 py-2 align-middle text-muted-foreground"
                        }
                      >
                        {line?.serialNo ?? "—"}
                      </td>
                      {canReceive ? (
                        <td className="px-3 py-2 align-middle">
                          {inTransit && line ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={pending}
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() =>
                                setPendingConfirm({
                                  type: "receive",
                                  serialNumberId: line.serialNumberId,
                                  serialNo: line.serialNo,
                                })
                              }
                            >
                              Accept
                            </Button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

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
          <p className="text-sm text-muted-foreground">
            No stock or defective serials are free at this branch.
          </p>
        ) : null}
        {mode === "create" && lockedModelId && !serialsLoading && serials.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stock or defective serials are free for this model.
          </p>
        ) : null}
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
                  {historyLabel(row.action)}
                  {row.userName ? ` · ${row.userName}` : ""} · {new Date(row.at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

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
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                runConfirmed();
              }}
            >
              {pendingConfirm?.type === "receive" ? "Receive 1" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
  },
);

function runTransferAction(id: string, action: PendingConfirm) {
  switch (action.type) {
    case "approve":
      return approveTransferAction(id);
    case "reject":
      return rejectTransferAction(id);
    case "release":
      return executeTransferAction(id);
    case "receive":
      return receiveTransferAction(id, { serialNumberIds: [action.serialNumberId] });
    default: {
      const unreachable: never = action;
      throw unreachable;
    }
  }
}
