"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deliveryAuditLabel, DeliveryTracker } from "@/app/(app)/logistics/_components/delivery-tracker";
import {
  LogisticsShipmentSection,
  ShipmentPrintButton,
} from "@/app/(app)/logistics/_components/logistics-shipment-section";
import { shipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { CheckSapNowButton } from "@/app/(app)/logistics/_components/check-sap-now-button";
import {
  DocumentDetailBand,
  LogisticsHistoryBody,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import {
  DeliveryReceiveDialog,
  type ReceiveTarget,
} from "@/app/(app)/logistics/_components/delivery-receive-dialog";
import {
  DeliveryReturnReviewDialog,
  type ReturnTarget,
  type ReviewReturnActions,
} from "@/app/(app)/logistics/_components/delivery-return-dialogs";
import { DeliveryReturnStatusBadge } from "@/app/(app)/logistics/_components/delivery-transfer-status-badge";
import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";
import {
  CompactLineTable,
  CompactModelCell,
  type CompactLineColumn,
} from "@/components/compact-line-table";
import { RecordFieldGrid, RecordReadout, RecordSection, RecordSheet } from "@/components/record-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  acceptDeliveryAction,
  cancelDeliveryReturnAction,
  decideDeliveryReturnAction,
  getDeliveryReturnAction,
  listDeliveryReceiptLinesAction,
  requestDeliveryReturnAction,
  saveDeliveryShipmentAction,
  retryDeliveryReturnSapAction,
} from "@/features/logistics/actions/logistics.actions";
import { needsSapRetry } from "@/features/logistics/constants/delivery-workflow-labels";
import {
  DELIVERY_WORKFLOW_CODE,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { DeliveryDetail } from "@/features/logistics/services/delivery-posting.service";
import {
  formatSapDocNo,
  SAP_DOC_DATE_LABEL,
  SAP_DOC_NO_LABEL,
} from "@/features/logistics/lib/sap-doc-number";
import {
  SAP_FOLLOW_STATUS_HINTS,
  SAP_FOLLOW_STATUS_LABELS,
  SAP_FOLLOW_STATUS_TONES,
} from "@/features/logistics/constants/sap-follow-status";
import { orderSapDocumentFields } from "@/features/orders/constants/order-sap-doc-type";
import { cn } from "@/utils/cn";
import { worksheetTotalsLabel } from "@/features/orders/lib/order-worksheet-filters";

const REVIEW_ACTIONS: ReviewReturnActions = {
  load: getDeliveryReturnAction,
  decide: decideDeliveryReturnAction,
  retry: retryDeliveryReturnSapAction,
  cancel: cancelDeliveryReturnAction,
};

type OrderLine = DeliveryDetail["orderLines"][number];
type SerialLine = DeliveryDetail["serials"][number];

const ORDER_LINE_COLUMNS: CompactLineColumn<OrderLine>[] = [
  {
    id: "model",
    header: "Model",
    cell: (line) => <CompactModelCell code={line.skuCode} name={line.modelName} />,
  },
  {
    id: "quantity",
    header: "Quantity",
    align: "right",
    className: "w-28 tabular-nums",
    cell: (line) => line.quantity.toLocaleString(),
  },
];

const SERIAL_COLUMNS: CompactLineColumn<SerialLine>[] = [
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

function OrderLinesTable({ lines }: { lines: OrderLine[] }) {
  return (
    <CompactLineTable
      rows={lines}
      getRowId={(line) => line.id}
      columns={ORDER_LINE_COLUMNS}
      searchText={(line) => [line.skuCode, line.modelName, String(line.quantity)]}
      searchPlaceholder="Search lines…"
      itemLabel="line"
      emptyMessage="No approved lines on this order."
      noMatchMessage="No matching lines."
      summaryFor={(visible) =>
        worksheetTotalsLabel(
          visible.length,
          visible.reduce((sum, line) => sum + line.quantity, 0),
        )
      }
    />
  );
}

function SerialsTable({ lines }: { lines: SerialLine[] }) {
  return (
    <CompactLineTable
      rows={lines}
      getRowId={(line) => line.serialNumberId}
      columns={SERIAL_COLUMNS}
      searchText={(line) => [line.skuCode, line.modelName, line.serialNo]}
      searchPlaceholder="Search serials…"
      itemLabel="serial"
      emptyMessage="No serials on this delivery."
      noMatchMessage="No matching serials."
    />
  );
}

/** What a SAP user copies to, by the order's document: an ITR becomes an IT, an SO a DR. */
const COPY_TO_TARGET: Record<string, string> = {
  ITR: "an Inventory Transfer",
  SO: "a Delivery",
};

/**
 * The SAP side of the delivery: the ITR / SO ISMS posted at approval, and the IT / DR
 * documents SAP users made from it with Copy To, as the cron follow-up found them.
 */
function SapDocumentsSection({
  detail,
  canCheckSap,
}: {
  detail: DeliveryDetail;
  canCheckSap: boolean;
}) {
  const order = detail.order;
  if (!order?.sapDocType) return null;
  const base = orderSapDocumentFields({ sapDocType: order.sapDocType, sapDocNum: order.sapDocNum });
  const waiting =
    detail.status.code === DELIVERY_WORKFLOW_CODE.approved &&
    !detail.sapDocuments.some((doc) => doc.status === "APPLIED");

  return (
    <RecordSection
      title="SAP"
      description="Dispatch happens in SAP. ISMS checks SAP about every 10 minutes and adds the units it finds."
      divided
    >
      <RecordFieldGrid>
        <RecordReadout label="SAP document" value={base.type} />
        <RecordReadout
          label={base.numberLabel}
          value={<span className="font-mono tabular-nums">{base.number}</span>}
        />
      </RecordFieldGrid>
      {waiting ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Waiting for SAP: copy {order.sapDocType} {base.number} to {COPY_TO_TARGET[order.sapDocType]}{" "}
            in SAP to dispatch this delivery.
          </p>
          {canCheckSap ? <CheckSapNowButton /> : null}
        </div>
      ) : null}
      {detail.sapDocuments.length > 0 ? (
        <ul className="mt-3 divide-y rounded-md border">
          {detail.sapDocuments.map((doc) => (
            <li key={`${doc.docKind}-${doc.displayNo}`} className="grid gap-1 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">
                  {doc.docKind} <span className="font-mono tabular-nums">{doc.displayNo}</span>
                </span>
                <span className="text-muted-foreground">{formatInventoryDrDate(doc.docDate)}</span>
                {doc.status === "APPLIED" ? (
                  <span className="text-muted-foreground tabular-nums">
                    {doc.serialCount} unit{doc.serialCount === 1 ? "" : "s"} added
                  </span>
                ) : null}
                <Badge
                  variant="outline"
                  className={cn("ml-auto font-normal", SAP_FOLLOW_STATUS_TONES[doc.status])}
                >
                  {SAP_FOLLOW_STATUS_LABELS[doc.status] ?? doc.status}
                </Badge>
              </div>
              {doc.error ? <p className="text-destructive">{doc.error}</p> : null}
              {SAP_FOLLOW_STATUS_HINTS[doc.status] ? (
                <p className="text-xs text-muted-foreground">{SAP_FOLLOW_STATUS_HINTS[doc.status]}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </RecordSection>
  );
}

function deliveryPrintDocument(detail: DeliveryDetail) {
  const hasSerials = detail.serials.length > 0;
  return shipmentPrintDocument({
    title: "Delivery",
    documentNo: detail.deliveryNo,
    shipment: detail.shipment,
    fields: [
      { label: "Order", value: detail.order?.orderNumber ?? "—" },
      { label: "Branch", value: detail.branch.name },
      { label: SAP_DOC_NO_LABEL, value: formatSapDocNo(detail.drNo, detail.order?.sapDocType) ?? "—" },
      { label: SAP_DOC_DATE_LABEL, value: formatInventoryDrDate(detail.drDate) },
    ],
    lines: hasSerials
      ? detail.serials.map((line) => ({
          model: `${line.skuCode} ${line.modelName}`,
          detail: line.serialNo,
        }))
      : detail.orderLines.map((line) => ({
          model: `${line.skuCode} ${line.modelName}`,
          detail: line.quantity.toLocaleString(),
        })),
    lineHeaders: hasSerials
      ? { model: "Model", detail: "Serial number" }
      : { model: "Model", detail: "Quantity" },
  });
}

export function DeliveryDetailView({
  detail,
  capabilities,
  workflowStatuses,
}: {
  detail: DeliveryDetail;
  capabilities: LogisticsActionCapabilities;
  workflowStatuses: readonly WorkflowStatusOption[];
}) {
  const router = useRouter();
  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null);
  const [returnReviewTarget, setReturnReviewTarget] = useState<ReturnTarget | null>(null);

  const code = detail.status.code;
  const dispatched =
    code === DELIVERY_WORKFLOW_CODE.pending || code === DELIVERY_WORKFLOW_CODE.partial;
  const hasSerials = detail.serials.length > 0;
  const canEditShipment =
    (capabilities.canManage || capabilities.canDispatch) &&
    code !== DELIVERY_WORKFLOW_CODE.rejected;

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <DocumentDetailBand
        backHref="/logistics/deliveries"
        backLabel="Back to deliveries"
        title={detail.deliveryNo}
        statusLine={
          <StatusCodeBadge
            code={detail.status.code}
            name={detail.status.name}
            color={detail.status.color}
          />
        }
        actions={
          <>
            {dispatched &&
            (capabilities.canAcceptDelivery || capabilities.canRequestDeliveryReturn) ? (
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() =>
                  setReceiveTarget({
                    id: detail.id,
                    deliveryNo: detail.deliveryNo,
                    branchName: detail.branch.name,
                    sapDocType: detail.order?.sapDocType ?? null,
                  })
                }
              >
                {code === DELIVERY_WORKFLOW_CODE.partial ? "Receive remaining" : "Receive"}
              </Button>
            ) : null}
            <ShipmentPrintButton document={deliveryPrintDocument(detail)} />
          </>
        }
      />

      <RecordSheet>
        <RecordSection title="Progress">
          <DeliveryTracker
            status={detail.status}
            history={detail.history}
            catalog={workflowStatuses}
          />
        </RecordSection>
        <RecordSection
          title="Delivery"
          description="Order, branch, and the SAP document."
          divided
        >
          <RecordFieldGrid>
            <RecordReadout label="Order" value={detail.order?.orderNumber ?? "—"} />
            <RecordReadout label="Branch" value={detail.branch.name} />
            <RecordReadout
              label={SAP_DOC_NO_LABEL}
              value={formatSapDocNo(detail.drNo, detail.order?.sapDocType) ?? "—"}
            />
            <RecordReadout label={SAP_DOC_DATE_LABEL} value={formatInventoryDrDate(detail.drDate)} />
          </RecordFieldGrid>
        </RecordSection>
        <SapDocumentsSection
          detail={detail}
          canCheckSap={capabilities.canDispatch || capabilities.canManage}
        />
        <LogisticsShipmentSection
          key={`${detail.shipment.waybillNo ?? ""}|${detail.shipment.courierName ?? ""}|${detail.shipment.scheduledAt ?? ""}`}
          shipment={detail.shipment}
          canEdit={canEditShipment}
          onSave={async (input) => {
            const result = await saveDeliveryShipmentAction(detail.id, input);
            if ("success" in result && result.success) refresh();
            return result;
          }}
        />
        <RecordSection
          title={hasSerials ? "Units" : "Models"}
          description={
            hasSerials
              ? "Serials on this delivery."
              : "Approved models and quantities on this delivery."
          }
          divided
        >
          {hasSerials ? (
            <SerialsTable lines={detail.serials} />
          ) : (
            <OrderLinesTable lines={detail.orderLines} />
          )}
        </RecordSection>
        {detail.returns.length > 0 ? (
          <RejectRequestsSection
            returns={detail.returns}
            canApprove={capabilities.canApproveDeliveryReturn}
            canRetry={capabilities.canApproveDeliveryReturn || capabilities.canRequestDeliveryReturn}
            onOpen={(returnId) =>
              setReturnReviewTarget({ returnId, deliveryNo: detail.deliveryNo, branchName: detail.branch.name })
            }
          />
        ) : null}
        <RecordSection title="History" divided>
          <LogisticsHistoryBody
            groupByLabel={false}
            items={detail.history.map((row) => ({
              id: row.id,
              label: deliveryAuditLabel(row.action),
              actor: row.userName,
              at: row.at,
            }))}
          />
        </RecordSection>
      </RecordSheet>

      <DeliveryReturnReviewDialog
        target={returnReviewTarget}
        canApprove={capabilities.canApproveDeliveryReturn}
        canRetry={capabilities.canApproveDeliveryReturn || capabilities.canRequestDeliveryReturn}
        actions={REVIEW_ACTIONS}
        onClose={() => setReturnReviewTarget(null)}
        onDone={refresh}
      />

      <DeliveryReceiveDialog
        target={receiveTarget}
        onClose={() => setReceiveTarget(null)}
        onReceived={refresh}
        loadLines={listDeliveryReceiptLinesAction}
        accept={acceptDeliveryAction}
        canReceive={capabilities.canAcceptDelivery}
        requestReturn={capabilities.canRequestDeliveryReturn ? requestDeliveryReturnAction : undefined}
      />
    </div>
  );
}

/**
 * Every reject request on the delivery. Each one is approved on its own and
 * posts its own SAP IT (consignment) or Return (outright).
 */
function RejectRequestsSection({
  returns,
  canApprove,
  canRetry,
  onOpen,
}: {
  returns: DeliveryDetail["returns"];
  canApprove: boolean;
  canRetry: boolean;
  onOpen: (returnId: string) => void;
}) {
  return (
    <RecordSection
      title="Rejected units"
      description="Each reject goes to the TL on its own and, once approved, posts its own SAP IT or Return."
      divided
    >
      <ul className="divide-y rounded-md border">
        {returns.map((row) => {
          const action =
            row.status === "PENDING_APPROVAL" && canApprove
              ? "Review"
              : needsSapRetry(row) && canRetry
                ? "Retry SAP posting"
                : "View";
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm">
              <span className="font-mono">{row.requestNo}</span>
              <DeliveryReturnStatusBadge status={row.status} />
              <span className="text-muted-foreground">
                {row.unitCount} unit{row.unitCount === 1 ? "" : "s"}
                {row.sapDocNo ? ` · SAP ${row.sapDocNo}` : ""}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.remarks}>
                {row.remarks}
              </span>
              <Button
                size="sm"
                variant={action === "Review" ? "default" : "outline"}
                className="max-sm:h-11"
                onClick={() => onOpen(row.id)}
              >
                {action}
              </Button>
            </li>
          );
        })}
      </ul>
    </RecordSection>
  );
}
