import type {
  SapIntegrationJobStatus,
  SapIntegrationJobType,
} from "@prisma/client";

/**
 * Plain names for the SAP integration page.
 * Older job types stay labeled so rows queued before a change still read clearly.
 * Pull-outs, sales summaries, stock sync, delivery updates, and stock adjustments
 * are older rows only.
 */
export const SAP_JOB_TYPE_LABELS: Record<SapIntegrationJobType, string> = {
  approved_order: "Branch order",
  service_center_order: "Service center order",
  sc_delivery_return: "Service center delivery reject",
  delivery_return: "Delivery return",
  delivery_partial_return: "Partial return",
  delivery_transfer: "Unit transfer",
  inventory_posting: "Stock count",
  pullout_itr: "Pull-out",
  sales_summary: "Sales summary",
  inventory_sync_inbound: "Stock sync",
  delivery_sync_inbound: "Delivery update",
  inventory_adjustment: "Stock adjustment",
};

export const SAP_JOB_STATUS_LABELS: Record<SapIntegrationJobStatus, string> = {
  pending: "Waiting",
  processing: "Sending",
  completed: "Sent",
  failed: "Needs a retry",
  dead_letter: "Could not send",
};

/** Card filters on the SAP integration page. Absent means the whole queue. */
export const SAP_QUEUE_VIEWS = ["waiting", "attention", "sent"] as const;
export type SapQueueView = (typeof SAP_QUEUE_VIEWS)[number];

export function parseSapQueueView(value?: string | null): SapQueueView | undefined {
  switch (value) {
    case "waiting":
    case "attention":
    case "sent":
      return value;
    default:
      return undefined;
  }
}

export function sapQueueViewStatuses(view: SapQueueView): SapIntegrationJobStatus[] {
  switch (view) {
    case "waiting":
      return ["pending", "processing"];
    case "attention":
      return ["failed", "dead_letter"];
    case "sent":
      return ["completed"];
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

export interface SapJobStatusCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead_letter: number;
}

export function emptySapJobStatusCounts(): SapJobStatusCounts {
  return {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dead_letter: 0,
  };
}

/** Pending and failed jobs the Send action can still claim. */
export function sapJobsReadyToSend(counts: SapJobStatusCounts): boolean {
  return counts.pending + counts.failed > 0;
}

const DOCUMENT_NUMBER_KEYS = ["orderNumber", "requestNo", "transferNo", "periodLabel"] as const;

/** Order or document number people already know. Missing keys stay blank, never a chopped id. */
export function sapJobDocumentNumber(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "—";
  const record = payload as Record<string, unknown>;
  for (const key of DOCUMENT_NUMBER_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "—";
}

export function sapJobNumberText(sapDocRef: string | null | undefined): string {
  const trimmed = sapDocRef?.trim();
  return trimmed ? trimmed : "Not in SAP yet.";
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function payloadText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Branch or warehouse from the payload, with the SAP code when it is stored there. */
export function sapJobPlace(payload: unknown): { label: string; value: string } | null {
  const record = payloadRecord(payload);
  if (!record) return null;
  const branchName = payloadText(record, "branchName");
  const warehouseName = payloadText(record, "warehouseName");
  const branchCode = payloadText(record, "branchSapCode");
  const warehouseCode = payloadText(record, "warehouseCode");
  const name = branchName ?? warehouseName;
  const code = branchCode ?? warehouseCode;
  if (!name && !code) return null;
  const warehouseOnly = Boolean(warehouseName || (warehouseCode && !branchCode && !branchName));
  const label = warehouseOnly ? "Warehouse" : "Branch";
  if (name && code && name !== code) return { label, value: `${name} (${code})` };
  if (name) return { label, value: name };
  if (branchCode && warehouseCode && branchCode !== warehouseCode) {
    return { label: "Branch", value: `${branchCode} (warehouse ${warehouseCode})` };
  }
  return { label, value: code ?? "" };
}

/** Sales order, inventory transfer, or return, from the SAP number or the stored document type. */
export function sapDocumentKindLabel(
  sapDocRef: string | null | undefined,
  payload: unknown,
): string | null {
  const record = payloadRecord(payload);
  const fromPayload = record ? payloadText(record, "docType") : null;
  const fromRef = sapDocRef?.trim().split("-")[0] ?? "";
  const code = (fromRef || fromPayload || "").toUpperCase();
  switch (code) {
    case "SO":
      return "Sales order";
    case "ITR":
    case "IT":
    case "OWTR":
      return "Inventory transfer";
    case "RETURN":
      return "Return";
    default:
      return null;
  }
}

/** Item code and quantity from payload lines. Raw JSON stays in Technical details. */
export function sapJobLinesSummary(payload: unknown): string | null {
  const lines = payloadRecord(payload)?.lines;
  if (!Array.isArray(lines)) return null;
  const parts: string[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const row = line as Record<string, unknown>;
    const code = payloadText(row, "skuCode") ?? payloadText(row, "itemCode");
    if (!code) continue;
    const qty = [row.approvedQty, row.quantity, row.countedQuantity].find(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
    parts.push(typeof qty === "number" ? `${code} × ${qty}` : code);
  }
  if (parts.length === 0) return null;
  const shown = parts.slice(0, 8);
  const extra = parts.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} and ${extra} more` : shown.join(", ");
}

export function sapJobWhen(job: {
  processedAt: Date | string | null;
  createdAt: Date | string;
}): Date | string {
  return job.processedAt ?? job.createdAt;
}

const sapJobDateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "medium",
});

export function formatSapJobDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return sapJobDateFormat.format(date);
}

/** Sent is green. A retry and a dead end are red. Waiting and sending stay neutral. */
export function sapJobStatusClassName(status: SapIntegrationJobStatus): string {
  switch (status) {
    case "completed":
      return "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "failed":
    case "dead_letter":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "pending":
    case "processing":
      return "";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export const SAP_REFERENCE_TYPES = {
  BranchOrder: "BranchOrder",
  BranchDelivery: "BranchDelivery",
  DeliveryTransfer: "DeliveryTransfer",
  DeliveryReturnRequest: "DeliveryReturnRequest",
  StockVariance: "StockVariance",
  StockCountSession: "StockCountSession",
  ServiceCenterOrder: "ServiceCenterOrder",
  ScDeliveryReturnRequest: "ServiceCenterDeliveryReturnRequest",
} as const;
