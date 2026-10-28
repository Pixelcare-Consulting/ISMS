"use client";

import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import Link from "next/link";
import { useMemo } from "react";

import {
  DocumentDetailBand,
  LogisticsHistoryBody,
  type LogisticsActivity,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { OrderHistoryLinesTable } from "@/app/(app)/orders/_components/order-history-lines-table";
import { OrderHistoryTracker } from "@/app/(app)/orders/_components/order-history-tracker";
import { useOrderWorksheet } from "@/app/(app)/orders/_components/use-order-worksheet";
import {
  RecordFieldGrid,
  RecordReadout,
  RecordSection,
  RecordSheet,
} from "@/components/record-section";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import {
  BRANCH_ORDER_STATUS_LABELS,
  BRANCH_ORDER_TYPE_LABELS,
} from "@/features/orders/constants/order-status";
import { getCurrentApproverLabel } from "@/features/orders/constants/order-workflow";
import {
  worksheetSummaryMode,
  type OrderReviewSnapshot,
} from "@/features/orders/lib/order-review-snapshot";
import { worksheetOrderTotals } from "@/features/orders/lib/order-worksheet-filters";
import { formatWorksheetCbm, worksheetLineCbm } from "@/features/orders/lib/order-worksheet-metrics";
import type { OrderTrackerNode } from "@/features/orders/lib/order-history-tracker";
import type { OrderSapDocumentFields } from "@/features/orders/constants/order-sap-doc-type";
import type {
  OrderWorksheetLine,
  OrderWorksheetSummary,
} from "@/features/orders/types/order-analytics";
import { formatPeso } from "@/utils/format-currency";

export interface OrderRecordLine {
  id: string;
  modelId: string;
  skuCode: string;
  name: string;
  quantity: number;
  amount: number | null;
  unitCbm: number | null;
  note: string | null;
  spNote: string | null;
}

export interface OrderOpenDeliveryLink {
  href: string;
  label: string;
}

interface OrderFigure {
  label: string;
  value: string;
  hint: string | null;
}

/** Read-only open page. Approval actions stay on Review. */
export function OrderRecordPage({
  backHref,
  backLabel,
  context,
  orderId,
  orderNumber,
  orderType,
  status,
  branchId,
  dealerName,
  branchName,
  paymentLabel,
  sapDocument,
  createdByName,
  notes,
  deliveryDueLabel = null,
  reviewSnapshot,
  steps,
  lines,
  history,
  delivery = null,
}: {
  backHref: string;
  backLabel: string;
  context: string;
  orderId: string;
  orderNumber: string;
  orderType: BranchOrderType;
  status: BranchOrderStatus;
  branchId: string;
  dealerName: string | null;
  branchName: string;
  paymentLabel: string | null;
  sapDocument: OrderSapDocumentFields;
  createdByName: string;
  notes: string | null;
  deliveryDueLabel?: string | null;
  reviewSnapshot: unknown;
  steps: OrderTrackerNode[];
  lines: OrderRecordLine[];
  history: LogisticsActivity[];
  delivery?: OrderOpenDeliveryLink | null;
}) {
  const modelIds = useMemo(() => lines.map((line) => line.modelId), [lines]);
  const worksheet = useOrderWorksheet({
    enabled: branchId.length > 0,
    branchId,
    orderType,
    existingModelIds: modelIds,
    excludeOrderId: orderId,
  });
  const sheetByModel = useMemo(() => {
    const map = new Map<string, OrderWorksheetLine>();
    for (const line of worksheet.payload?.lines ?? []) map.set(line.modelId, line);
    return map;
  }, [worksheet.payload]);
  const tableLines = useMemo(
    () =>
      lines.map((line) => ({
        id: line.id,
        skuCode: line.skuCode,
        name: line.name,
        quantity: line.quantity,
        amount: line.amount,
      })),
    [lines],
  );
  const figures = orderFigures({
    status,
    reviewSnapshot,
    summary: worksheet.payload?.summary ?? null,
    lines,
    sheetByModel,
  });
  const nextApprover = getCurrentApproverLabel(status, orderType).trim() || "—";
  const note = notes?.trim() ?? "";
  const deliveryLabel = delivery?.label.trim();

  return (
    <div className="space-y-6">
      <DocumentDetailBand
        backHref={backHref}
        backLabel={backLabel}
        title={orderNumber}
        statusLine={`${context} · ${BRANCH_ORDER_STATUS_LABELS[status]}`}
      />

      <RecordSheet>
        <RecordSection title="Progress">
          <OrderHistoryTracker items={[...steps]} />
        </RecordSection>
        <RecordSection
          title="Order"
          description="Dealer, branch, payment, and approval for this order."
          divided
        >
          <RecordFieldGrid>
            <RecordReadout label="Type" value={BRANCH_ORDER_TYPE_LABELS[orderType]} />
            <RecordReadout label="Branch" value={branchName || "—"} />
            {dealerName ? <RecordReadout label="Dealer" value={dealerName} /> : null}
            <RecordReadout label="Status" value={<OrderStatusBadge status={status} />} />
            {paymentLabel ? (
              <RecordReadout label="Mode of payment" value={paymentLabel} />
            ) : null}
            <RecordReadout label="SAP document" value={sapDocument.type} />
            <RecordReadout
              label={sapDocument.numberLabel}
              value={<span className="font-mono tabular-nums">{sapDocument.number}</span>}
            />
            <RecordReadout label="Created by" value={createdByName || "—"} />
            <RecordReadout label="Next approver" value={nextApprover} />
            {deliveryDueLabel ? (
              <RecordReadout label="Delivery due" value={deliveryDueLabel} />
            ) : null}
            <RecordReadout
              label="Order notes"
              wide
              multiline
              value={note || "No order notes."}
            />
            {figures.map((figure) => (
              <RecordReadout
                key={figure.label}
                label={figure.label}
                value={figure.value}
                hint={figure.hint}
              />
            ))}
          </RecordFieldGrid>
          {worksheet.loading && figures.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading stock and request totals…</p>
          ) : null}
          {worksheet.error && figures.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Stock and request totals are unavailable right now.
            </p>
          ) : null}
          {delivery && deliveryLabel ? (
            <p className="text-sm">
              <Link
                href={delivery.href}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {deliveryLabel}
              </Link>
            </p>
          ) : null}
        </RecordSection>
        <RecordSection
          title="Models"
          description="Models and quantities on this order."
          divided
        >
          <OrderHistoryLinesTable lines={tableLines} />
        </RecordSection>
        <RecordSection title="Approval history" divided>
          <LogisticsHistoryBody groupByLabel={false} items={history} />
        </RecordSection>
      </RecordSheet>
    </div>
  );
}

function orderFigures(input: {
  status: BranchOrderStatus;
  reviewSnapshot: unknown;
  summary: OrderWorksheetSummary | null;
  lines: readonly OrderRecordLine[];
  sheetByModel: ReadonlyMap<string, OrderWorksheetLine>;
}): OrderFigure[] {
  const choice = worksheetSummaryMode(input.status, input.reviewSnapshot);
  if (choice.mode === "snapshot" && choice.snapshot) {
    return snapshotFigures(choice.snapshot);
  }

  const priced = pricedTotals(input.lines, input.sheetByModel);
  const figures: OrderFigure[] = [];
  if (choice.mode === "current" && input.summary) {
    const dii = formatDiiFigure(
      input.summary.computedDii,
      input.summary.diiUnavailableReason,
      input.summary.salesUnavailable,
    );
    figures.push({ label: "DII", value: dii.value, hint: dii.hint });
    figures.push({
      label: "Stock value",
      value: formatPeso(input.summary.inventoryAmount),
      hint: null,
    });
  }
  if (priced.requested != null) {
    figures.push({ label: "Requested", value: formatPeso(priced.requested), hint: null });
  }
  if (priced.cbm != null) {
    figures.push({ label: "Total CBM", value: formatWorksheetCbm(priced.cbm), hint: null });
  }
  return figures;
}

function snapshotFigures(snapshot: OrderReviewSnapshot): OrderFigure[] {
  const dii = formatDiiFigure(
    snapshot.computedDii,
    snapshot.diiUnavailableReason,
    snapshot.salesUnavailable,
  );
  return [
    { label: "DII", value: dii.value, hint: dii.hint },
    { label: "Stock value", value: formatPeso(snapshot.inventoryAmount), hint: null },
    { label: "Requested", value: formatPeso(snapshot.requestedAmount), hint: null },
    { label: "Total CBM", value: formatWorksheetCbm(snapshot.requestedCbm), hint: null },
  ];
}

function pricedTotals(
  lines: readonly OrderRecordLine[],
  sheetByModel: ReadonlyMap<string, OrderWorksheetLine>,
): { requested: number | null; cbm: number | null } {
  if (lines.length === 0) return { requested: null, cbm: null };
  const fromSheet = sheetTotals(lines, sheetByModel);
  if (fromSheet) return fromSheet;
  const requested = lines.every((line) => line.amount != null)
    ? lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
    : null;
  const cbm = lines.every((line) => line.unitCbm != null)
    ? lines.reduce((sum, line) => sum + worksheetLineCbm(line.quantity, line.unitCbm ?? 0), 0)
    : null;
  return { requested, cbm };
}

function sheetTotals(
  lines: readonly OrderRecordLine[],
  sheetByModel: ReadonlyMap<string, OrderWorksheetLine>,
): { requested: number; cbm: number } | null {
  const priced = [];
  for (const line of lines) {
    const sheet = sheetByModel.get(line.modelId);
    if (!sheet) return null;
    priced.push({
      requestedQty: line.quantity,
      approvedQty: null,
      srp: sheet.srp,
      cbm: sheet.cbm,
    });
  }
  const totals = worksheetOrderTotals(priced);
  return { requested: totals.requestedAmount, cbm: totals.requestedCbm };
}

function formatDiiFigure(
  computed: number | null,
  reason: string | null,
  salesUnavailable: boolean,
): { value: string; hint: string | null } {
  if (salesUnavailable) {
    return { value: "N/A", hint: "Sales are unavailable for this period." };
  }
  if (computed == null || !Number.isFinite(computed)) {
    return { value: "N/A", hint: reason };
  }
  return { value: computed.toFixed(1), hint: null };
}
