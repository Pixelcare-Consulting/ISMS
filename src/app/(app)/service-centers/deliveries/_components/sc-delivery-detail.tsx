"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";
import {
  deliveryAuditLabel,
  DeliveryTracker,
} from "@/app/(app)/logistics/_components/delivery-tracker";
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
import { DrNoText } from "@/app/(app)/logistics/_components/dr-no-text";
import {
  DocumentDetailBand,
  LogisticsHistoryBody,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { ShipmentPrintButton } from "@/app/(app)/logistics/_components/shipment-print-button";
import { shipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { ScCheckSapNowButton } from "@/app/(app)/service-centers/deliveries/_components/sc-check-sap-now-button";
import { SC_DELIVERIES_PATH } from "@/app/(app)/service-centers/deliveries/_components/sc-deliveries-panel";
import {
  CompactLineTable,
  CompactModelCell,
  type CompactLineColumn,
} from "@/components/compact-line-table";
import { RecordFieldGrid, RecordReadout, RecordSection, RecordSheet } from "@/components/record-section";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import {
  DELIVERY_WORKFLOW_CODE,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import { needsSapRetry } from "@/features/logistics/constants/delivery-workflow-labels";
import { DR_DATE_LABEL, DR_NO_LABEL, formatRejectSapDocNo } from "@/features/logistics/lib/sap-doc-number";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  acceptScDeliveryAction,
  cancelScDeliveryReturnAction,
  getScDeliveryReturnAction,
  listScDeliveryReceiptLinesAction,
  requestScDeliveryReturnAction,
  retryScDeliveryReturnSapAction,
  type ScDeliveryDetail,
} from "@/features/service-center-ops/actions/sc-logistics.actions";
import type { ScLogisticsActionCapabilities } from "@/features/service-center-ops/constants/sc-permissions";

type Unit = ScDeliveryDetail["units"][number];
type RejectRow = ScDeliveryDetail["returns"][number];

/** SC rejects are approved when confirmed, so there is never a request to decide. */
const REVIEW_ACTIONS: ReviewReturnActions = {
  load: getScDeliveryReturnAction,
  decide: async () => ({ error: "Service center rejects need no approval" }),
  retry: retryScDeliveryReturnSapAction,
  cancel: cancelScDeliveryReturnAction,
};

function unitState(unit: Unit) {
  if (unit.returnedAt) return <span>Returned {formatInventoryDrDate(unit.returnedAt)}</span>;
  if (unit.acceptedAt) return <span>Received {formatInventoryDrDate(unit.acceptedAt)}</span>;
  if (unit.openReturn) return <span className="text-muted-foreground">Rejecting ({unit.openReturn.requestNo})</span>;
  return <span className="text-muted-foreground">In transit</span>;
}

const UNIT_COLUMNS: CompactLineColumn<Unit>[] = [
  {
    id: "model",
    header: "Model",
    cell: (unit) => <CompactModelCell code={unit.skuCode} name={unit.modelName} />,
  },
  {
    id: "serial",
    header: "Serial number",
    className: "w-48 font-mono",
    cell: (unit) => unit.serialNo,
  },
  {
    id: "state",
    header: "Status",
    className: "w-44",
    cell: unitState,
  },
];

function deliveryPrintDocument(detail: ScDeliveryDetail) {
  return shipmentPrintDocument({
    title: "Service center delivery",
    documentNo: detail.deliveryNo,
    fields: [
      { label: "Order", value: detail.orderNumber ?? "—" },
      { label: "Service center", value: detail.serviceCenterName },
      { label: "Location", value: detail.location ? detail.location.name : "—" },
      { label: DR_NO_LABEL, value: detail.drNo ?? "—" },
      { label: DR_DATE_LABEL, value: formatInventoryDrDate(detail.drDate) },
    ],
    lines: detail.units.map((unit) => ({
      model: `${unit.skuCode} ${unit.modelName}`,
      detail: unit.serialNo,
    })),
    lineHeaders: { model: "Model", detail: "Serial number" },
  });
}

export function ScDeliveryDetailView({
  detail,
  capabilities,
  workflowStatuses,
}: {
  detail: ScDeliveryDetail;
  capabilities: ScLogisticsActionCapabilities;
  workflowStatuses: readonly WorkflowStatusOption[];
}) {
  const router = useRouter();
  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReturnTarget | null>(null);
  // A delivery from an order without a location: the center's only one, or the one picked here.
  const onlyLocationId = detail.locations.length === 1 ? detail.locations[0].id : "";
  const [pickedLocationId, setPickedLocationId] = useState(onlyLocationId);
  const receivingLocationId = detail.location?.id ?? pickedLocationId;

  const code = detail.status.code;
  const hasOpenUnits = detail.units.some(
    (unit) => unit.acceptedAt === null && unit.returnedAt === null && unit.openReturn === null,
  );
  const canReject = capabilities.canRejectDelivery && detail.canRejectUnits;
  const canReceive =
    (capabilities.canAcceptDelivery || canReject) &&
    hasOpenUnits &&
    (code === DELIVERY_WORKFLOW_CODE.pending || code === DELIVERY_WORKFLOW_CODE.partial);
  // Rejecting needs no location; receiving does.
  const blockedOnLocation = !receivingLocationId && !canReject;
  const needsLocation = !detail.location && detail.locations.length > 1;

  return (
    <div className="space-y-6">
      <DocumentDetailBand
        backHref={SC_DELIVERIES_PATH}
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
            {canReceive ? (
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={blockedOnLocation}
                title={blockedOnLocation ? "Choose the receiving location first" : undefined}
                onClick={() =>
                  setReceiveTarget({
                    id: detail.id,
                    deliveryNo: detail.deliveryNo,
                    branchName: detail.serviceCenterName,
                    // SC orders post a Sales Order, so a reject posts a Return.
                    sapDocType: "SO",
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
          <DeliveryTracker status={detail.status} history={detail.history} catalog={workflowStatuses} />
        </RecordSection>
        <RecordSection
          title="Delivery"
          description="Order, service center, and the SAP DR."
          divided
        >
          <RecordFieldGrid>
            <RecordReadout label="Order" value={detail.orderNumber ?? "—"} />
            <RecordReadout label="Service center" value={detail.serviceCenterName} />
            <RecordReadout
              label="SAP SO no."
              value={
                detail.sapSoNum != null ? (
                  <span className="font-mono tabular-nums">{detail.sapSoNum}</span>
                ) : (
                  "—"
                )
              }
            />
            <RecordReadout label={DR_NO_LABEL} value={<DrNoText value={detail.drNo} />} />
            <RecordReadout label={DR_DATE_LABEL} value={formatInventoryDrDate(detail.drDate)} />
            {needsLocation ? (
              <SearchableSelect
                label="Receiving location"
                className="w-full"
                options={detail.locations.map((location) => ({
                  id: location.id,
                  label: location.name,
                  description: location.code,
                }))}
                value={pickedLocationId}
                onChange={setPickedLocationId}
                placeholder="Choose before receiving"
                searchPlaceholder="Search locations…"
                emptyMessage="This service center has no locations."
              />
            ) : (
              <RecordReadout
                label="Location"
                value={
                  detail.location
                    ? `${detail.location.name} (${detail.location.code})`
                    : detail.locations[0]
                      ? `${detail.locations[0].name} (${detail.locations[0].code})`
                      : "—"
                }
              />
            )}
          </RecordFieldGrid>
          {canCheckSapHint(detail) && capabilities.canCheckSap ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                More units on this order? Copy the Sales Order to another DR in SAP, then check SAP.
              </p>
              <ScCheckSapNowButton />
            </div>
          ) : null}
        </RecordSection>
        <RecordSection title="Units" description="Serials on the SAP DR." divided>
          <CompactLineTable
            rows={detail.units}
            getRowId={(unit) => unit.serialNumberId}
            columns={UNIT_COLUMNS}
            searchText={(unit) => [unit.skuCode, unit.modelName, unit.serialNo]}
            searchPlaceholder="Search serials…"
            itemLabel="serial"
            emptyMessage="No serials on this delivery."
            noMatchMessage="No matching serials."
          />
        </RecordSection>
        {detail.returns.length > 0 ? (
          <RejectedUnitsSection
            returns={detail.returns}
            canRetry={capabilities.canRejectDelivery}
            onOpen={(returnId) =>
              setReviewTarget({ returnId, deliveryNo: detail.deliveryNo, branchName: detail.serviceCenterName })
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

      <DeliveryReceiveDialog
        target={receiveTarget}
        onClose={() => setReceiveTarget(null)}
        onReceived={() => router.refresh()}
        loadLines={listScDeliveryReceiptLinesAction}
        accept={async (deliveryId, input) => {
          if (!receivingLocationId) return { error: "Choose the receiving location first" };
          return acceptScDeliveryAction(deliveryId, {
            serialNumberIds: input.serialNumberIds,
            serviceCenterLocationId: receivingLocationId,
          });
        }}
        canReceive={capabilities.canAcceptDelivery}
        requestReturn={canReject ? requestScDeliveryReturnAction : undefined}
      />

      <DeliveryReturnReviewDialog
        target={reviewTarget}
        canApprove={false}
        canRetry={capabilities.canRejectDelivery}
        actions={REVIEW_ACTIONS}
        onClose={() => setReviewTarget(null)}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

/** Each reject with its SAP Return; a failed post can be retried or cancelled from here. */
function RejectedUnitsSection({
  returns,
  canRetry,
  onOpen,
}: {
  returns: readonly RejectRow[];
  canRetry: boolean;
  onOpen: (returnId: string) => void;
}) {
  return (
    <RecordSection
      title="Rejected units"
      description="Each reject posts its own SAP Return as soon as it is confirmed."
      divided
    >
      <ul className="divide-y rounded-md border">
        {returns.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm">
            <span className="font-mono">{row.requestNo}</span>
            <DeliveryReturnStatusBadge status={row.status} />
            <span className="text-muted-foreground">
              {row.unitCount} unit{row.unitCount === 1 ? "" : "s"}
              {row.sapDocNo ? ` · ${formatRejectSapDocNo(row.sapDocNo, "SO")}` : ""}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.remarks}>
              {row.remarks}
            </span>
            <Button size="sm" variant="outline" className="max-sm:h-11" onClick={() => onOpen(row.id)}>
              {needsSapRetry(row) && canRetry ? "Retry SAP posting" : "View"}
            </Button>
          </li>
        ))}
      </ul>
    </RecordSection>
  );
}

/** Order deliveries only: a pull-out redelivery has no Sales Order to copy again. */
function canCheckSapHint(detail: ScDeliveryDetail): boolean {
  return detail.orderNumber !== null;
}
