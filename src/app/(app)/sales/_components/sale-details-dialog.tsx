"use client";

import { useState } from "react";

import { SaleProofViewerDialog } from "@/app/(app)/sales/_components/sale-proof-viewer-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { SaleStatusCodeRef } from "@/features/sales/actions/sales.actions";
import { isDealerInitiatedDocumentTypeName } from "@/features/sales/constants/process-return";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { capturesDeliveryReceipt } from "@/features/sales/utils/delivery-method";
import { canEditSaleHeaderForLines } from "@/features/sales/utils/sale-header-edit";
import { formatPeso } from "@/utils/format-currency";

export interface SaleDetailsLine {
  detailId: string;
  packageName: string | null;
  brandName: string | null;
  modelId: string | null;
  modelLabel: string | null;
  serialNumberId: string | null;
  serialNo: string;
  saleAmount: string;
  modelPrice: string | null;
  deliveryNo: string | null;
  /** YYYY-MM-DD, ready for an <input type="date">. */
  deliveryDate: string | null;
  statusCode: SaleStatusCodeRef | null;
}

export interface SaleDetailsPayload {
  id: string;
  transactionNo: string;
  transactionDate: string | null;
  /** YYYY-MM-DD for header edit date input. */
  transactionDateInput: string | null;
  customerName: string | null;
  contactNo: string | null;
  siTrans: string | null;
  infoSlipVsoRrReleased: string | null;
  rrReceiveDeliver: string | null;
  atrStatus: string;
  atrStatusCode: SaleStatusCodeRef;
  notes: string | null;
  proofPaths: string[];
  proofCount: number;
  amount: string;
  reserved: boolean;
  stockBranchId: string;
  branchId: string;
  alternateBranchId: string;
  paymentTypeId: string | null;
  saleTypeId: string | null;
  customerDeliveryMethodId: string | null;
  branch: { id: string; name: string };
  stockSourceBranch: { id: string; name: string } | null;
  paymentType: { id: string; name: string } | null;
  saleType: { id: string; name: string } | null;
  customerDeliveryMethod: { id: string; name: string } | null;
  returnRequest: {
    id: string;
    status: string;
    actionType: "return" | "replacement";
    stockStatusCode: "STK" | "DEF";
    hasAtrOdrfPdf: boolean;
    documentTypeName: string | null;
  } | null;
  returnStatusCode: SaleStatusCodeRef | null;
  createdByName: string | null;
  lines: SaleDetailsLine[];
}

export type SaleReturnConfirmAction =
  | "request"
  | "evaluate"
  | "approve"
  | "reject"
  | "restore"
  | "complete_replacement";

interface SaleDetailsDialogProps {
  sale: SaleDetailsPayload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capabilities: Pick<
    SalesActionCapabilities,
    | "canUpdateSaleHeader"
    | "canCreateSale"
    | "canRequestReturn"
    | "canEvaluateReturn"
    | "canApproveReturn"
    | "canCompleteReturn"
  >;
  pending?: boolean;
  onEditLine: (line: SaleDetailsLine) => void;
  onEditHeader?: () => void;
  onReturnAction: (
    action: SaleReturnConfirmAction,
    detailId?: string,
  ) => void;
}

/** Line Edit is only for exact TO-FOLLOW placeholders (pending real serial). */
function canEditSaleLine(line: SaleDetailsLine): boolean {
  return !line.serialNumberId && line.serialNo === TO_FOLLOW_SERIAL_LABEL;
}

/** Request return is per serial line while the package ATR is still open. */
function canRequestReturnOnLine(
  line: SaleDetailsLine,
  showRequestReturn: boolean,
): boolean {
  return showRequestReturn && Boolean(line.serialNumberId);
}

function formatOptionalDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Formats a YYYY-MM-DD day without letting the local zone shift it. */
function formatDayOnly(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function DeliveryStack({
  deliveryNo,
  deliveryDate,
}: {
  deliveryNo: string | null;
  deliveryDate: string | null;
}) {
  const no = deliveryNo?.trim() || null;
  const date = formatDayOnly(deliveryDate);
  if (!no && !date) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate font-medium" title={no ?? undefined}>
        {no ?? "—"}
      </p>
      {date ? (
        <p className="truncate text-[11px] text-muted-foreground">{date}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">No date</p>
      )}
    </div>
  );
}

function BrandModelStack({
  brandName,
  modelLabel,
}: {
  brandName: string | null;
  modelLabel: string | null;
}) {
  const brand = brandName?.trim() || null;
  const model = modelLabel?.trim() || null;
  if (!brand && !model) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate font-medium" title={brand ?? undefined}>
        {brand ?? "—"}
      </p>
      {model ? (
        <p
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={model}
        >
          {model}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">No model</p>
      )}
    </div>
  );
}

function SerialNumberCell({
  serialNo,
  className,
}: {
  serialNo: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={
            className ??
            "block max-w-full break-all font-mono text-xs leading-snug"
          }
        >
          {serialNo}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="z-70 max-w-[min(24rem,calc(100vw-2rem))] break-all font-mono text-xs"
      >
        {serialNo}
      </TooltipContent>
    </Tooltip>
  );
}

function SaleProofReview({
  proofPaths,
  onOpen,
}: {
  proofPaths: string[];
  onOpen: () => void;
}) {
  if (proofPaths.length === 0) {
    return <span>None</span>;
  }

  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto px-0 text-sm"
      onClick={onOpen}
    >
      {proofPaths.length === 1
        ? "Review proof"
        : `${proofPaths.length} attachments — review`}
    </Button>
  );
}

export function SaleDetailsDialog({
  sale,
  open,
  onOpenChange,
  capabilities,
  pending = false,
  onEditLine,
  onEditHeader,
  onReturnAction,
}: SaleDetailsDialogProps) {
  const [proofViewerOpen, setProofViewerOpen] = useState(false);
  const dateLabel = formatOptionalDate(sale.transactionDate);
  // Pickup sales have no delivery receipt, so the column is noise.
  const showDelivery = capturesDeliveryReceipt(
    sale.customerDeliveryMethod?.name,
  );
  const totalLines = sale.lines.length;
  const returnStatus = sale.returnRequest?.status;
  const showRequestReturn =
    !sale.returnRequest &&
    sale.atrStatus === "open" &&
    capabilities.canRequestReturn;
  const showCsActions =
    returnStatus === "pending_cs" && capabilities.canEvaluateReturn;
  const showTlActions =
    returnStatus === "pending_tl" &&
    capabilities.canApproveReturn &&
    isDealerInitiatedDocumentTypeName(sale.returnRequest?.documentTypeName);
  const showRestore =
    returnStatus === "approved" &&
    capabilities.canCompleteReturn &&
    (sale.returnRequest?.actionType ?? "return") !== "replacement";
  const showCompleteReplacement =
    returnStatus === "approved" &&
    capabilities.canCompleteReturn &&
    (sale.returnRequest?.actionType ?? "return") === "replacement";
  const hasAtrActions =
    showCsActions ||
    showTlActions ||
    showRestore ||
    showCompleteReplacement;
  const showHeaderEdit =
    Boolean(onEditHeader) &&
    capabilities.canUpdateSaleHeader &&
    canEditSaleHeaderForLines(sale.lines);
  const canEditLines = capabilities.canCreateSale;

  return (
    <>
    <TooltipProvider delayDuration={200}>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] w-[min(calc(100vw-2rem),48rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Sale details {sale.transactionNo}</span>
            {showHeaderEdit ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 font-normal"
                disabled={pending}
                onClick={onEditHeader}
              >
                Edit header
              </Button>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Sale header, serial lines, and return actions for this transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <dl className="grid shrink-0 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Date</dt>
              <dd className="text-right">{dateLabel ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Branch</dt>
              <dd className="text-right">{sale.branch.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Stock source</dt>
              <dd className="text-right">
                {sale.stockSourceBranch?.name ?? sale.branch.name}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="text-right">{sale.customerName?.trim() || "—"}</dd>
            </div>
            {sale.siTrans ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">SI / Trans</dt>
                <dd className="text-right font-mono text-xs">{sale.siTrans}</dd>
              </div>
            ) : null}
            {sale.paymentType ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Payment</dt>
                <dd className="text-right">{sale.paymentType.name}</dd>
              </div>
            ) : null}
            {sale.saleType ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Sale type</dt>
                <dd className="text-right">{sale.saleType.name}</dd>
              </div>
            ) : null}
            {sale.customerDeliveryMethod ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="text-right">{sale.customerDeliveryMethod.name}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">ATR</dt>
              <dd className="text-right">
                <StatusCodeBadge
                  code={sale.atrStatusCode.code}
                  name={sale.atrStatusCode.name}
                  color={sale.atrStatusCode.color}
                />
              </dd>
            </div>
            {sale.returnRequest && sale.returnStatusCode ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Return</dt>
                <dd className="text-right">
                  <StatusCodeBadge
                    code={sale.returnStatusCode.code}
                    name={sale.returnStatusCode.name}
                    color={sale.returnStatusCode.color}
                  />
                </dd>
              </div>
            ) : null}
            {sale.createdByName ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Created by</dt>
                <dd className="text-right">{sale.createdByName}</dd>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Proof</dt>
              <dd className="text-right">
                <SaleProofReview
                  proofPaths={sale.proofPaths}
                  onOpen={() => setProofViewerOpen(true)}
                />
              </dd>
            </div>
          </dl>

          <div className="shrink-0 space-y-2">
            <Label>Notes</Label>
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
              {sale.notes?.trim() ? sale.notes : "No notes."}
            </p>
          </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-2">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <Label>Sale lines</Label>
                <span className="text-xs text-muted-foreground">
                  Total {totalLines}
                </span>
              </div>

              {/* Mobile: stacked cards */}
              <div className="min-h-0 max-h-80 space-y-2 overflow-y-auto sm:hidden">
                {sale.lines.map((line, index) => (
                  <div
                    key={line.detailId}
                    className="space-y-2 rounded-md border bg-card p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs text-muted-foreground">
                          Line {index + 1}
                          {line.packageName ? ` · ${line.packageName}` : ""}
                        </p>
                        <BrandModelStack
                          brandName={line.brandName}
                          modelLabel={line.modelLabel}
                        />
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {canEditLines && canEditSaleLine(line) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            disabled={pending}
                            onClick={() => onEditLine(line)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {canRequestReturnOnLine(line, showRequestReturn) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            disabled={pending}
                            onClick={() =>
                              onReturnAction("request", line.detailId)
                            }
                          >
                            Request return
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">SN</dt>
                        <dd className="min-w-0">
                          <SerialNumberCell
                            serialNo={line.serialNo}
                            className="block max-w-full break-all font-mono"
                          />
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="pt-0.5">
                          {line.statusCode ? (
                            <StatusCodeBadge
                              code={line.statusCode.code}
                              name={line.statusCode.name}
                              color={line.statusCode.color}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Sale</dt>
                        <dd className="font-mono tabular-nums">
                          {formatPeso(Number(line.saleAmount))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Model price</dt>
                        <dd className="font-mono tabular-nums">
                          {line.modelPrice != null ? (
                            formatPeso(Number(line.modelPrice))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </dd>
                      </div>
                      {showDelivery ? (
                        <div className="col-span-2 min-w-0">
                          <dt className="text-muted-foreground">Delivery</dt>
                          <dd className="min-w-0">
                            <DeliveryStack
                              deliveryNo={line.deliveryNo}
                              deliveryDate={line.deliveryDate}
                            />
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ))}
              </div>

              {/* Desktop / tablet: table — SN left of Status */}
              <div className="hidden min-h-0 max-h-105 w-full flex-1 overflow-auto rounded-md border sm:block">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-8" />
                    <col className="w-32" />
                    <col />
                    <col className="w-40" />
                    <col className="w-28" />
                    <col className="w-16" />
                    <col className="w-24" />
                    {showDelivery ? <col className="w-28" /> : null}
                    <col className="w-28" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur-sm">
                    <tr>
                      <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                        #
                      </th>
                      <th className="whitespace-nowrap py-2 pl-2 pr-3 text-left font-medium">
                        Package
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        Brand / Model
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                        SN
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                        Status
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        Sale
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        Model price
                      </th>
                      {showDelivery ? (
                        <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                          Delivery
                        </th>
                      ) : null}
                      <th className="sticky right-0 whitespace-nowrap bg-muted/95 px-2 py-2 text-right font-medium shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.lines.map((line, index) => (
                      <tr key={line.detailId} className="border-t">
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                          {index + 1}
                        </td>
                        <td
                          className="truncate py-2 pl-2 pr-3"
                          title={line.packageName ?? undefined}
                        >
                          {line.packageName ?? "—"}
                        </td>
                        <td className="px-2 py-2">
                          <BrandModelStack
                            brandName={line.brandName}
                            modelLabel={line.modelLabel}
                          />
                        </td>
                        <td className="min-w-0 px-2 py-2">
                          <SerialNumberCell serialNo={line.serialNo} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          {line.statusCode ? (
                            <StatusCodeBadge
                              code={line.statusCode.code}
                              name={line.statusCode.name}
                              color={line.statusCode.color}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs tabular-nums">
                          {formatPeso(Number(line.saleAmount))}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs tabular-nums">
                          {line.modelPrice != null ? (
                            formatPeso(Number(line.modelPrice))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {showDelivery ? (
                          <td className="min-w-0 px-2 py-2 text-xs">
                            <DeliveryStack
                              deliveryNo={line.deliveryNo}
                              deliveryDate={line.deliveryDate}
                            />
                          </td>
                        ) : null}
                        <td className="sticky right-0 whitespace-nowrap bg-card px-2 py-2 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                          <div className="flex flex-col items-end gap-1">
                            {canEditLines && canEditSaleLine(line) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => onEditLine(line)}
                              >
                                Edit
                              </Button>
                            ) : null}
                            {canRequestReturnOnLine(line, showRequestReturn) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() =>
                                  onReturnAction("request", line.detailId)
                                }
                              >
                                Request return
                              </Button>
                            ) : null}
                            {!(
                              (canEditLines && canEditSaleLine(line)) ||
                              canRequestReturnOnLine(line, showRequestReturn)
                            ) ? (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Total lines:{" "}
                <span className="font-medium text-foreground">{totalLines}</span>
                {" • "}
                Sale total:{" "}
                <span className="font-medium text-foreground">
                  {formatPeso(Number(sale.amount))}
                </span>
              </div>
            </div>
        </div>

        {hasAtrActions ? (
          <DialogFooter className="mt-1 shrink-0 border-t pt-3 sm:justify-end">
            {showCsActions ? (
              <>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => onReturnAction("evaluate")}
                >
                  CS evaluate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => onReturnAction("reject")}
                >
                  Reject
                </Button>
              </>
            ) : null}
            {showTlActions ? (
              <>
                <Button
                  size="sm"
                  className="bg-amber-600 text-white hover:bg-amber-700"
                  disabled={pending}
                  onClick={() => onReturnAction("approve")}
                >
                  TL approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => onReturnAction("reject")}
                >
                  Reject
                </Button>
              </>
            ) : null}
            {showRestore ? (
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={pending}
                onClick={() => onReturnAction("restore")}
              >
                Restore stock
              </Button>
            ) : null}
            {showCompleteReplacement ? (
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={pending}
                onClick={() => onReturnAction("complete_replacement")}
              >
                Complete replacement
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
    </TooltipProvider>
    <SaleProofViewerDialog
      key={`${sale.id}-${proofViewerOpen ? "open" : "closed"}`}
      saleId={sale.id}
      proofPaths={sale.proofPaths}
      open={proofViewerOpen}
      onOpenChange={setProofViewerOpen}
    />
    </>
  );
}
