"use client";

import { ExternalLink } from "lucide-react";

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { SaleStatusCodeRef } from "@/features/sales/actions/sales.actions";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import {
  saleProofFileName,
  saleProofViewUrl,
} from "@/features/sales/utils/sale-proof";
import { formatPeso } from "@/utils/format-currency";

export interface SaleDetailsLine {
  detailId: string;
  packageName: string | null;
  brandName: string | null;
  modelLabel: string | null;
  serialNumberId: string | null;
  serialNo: string;
  saleAmount: string;
  modelPrice: string | null;
  statusCode: SaleStatusCodeRef | null;
}

export interface SaleDetailsPayload {
  id: string;
  transactionNo: string;
  transactionDate: string | null;
  customerName: string | null;
  siTrans: string | null;
  atrStatus: string;
  atrStatusCode: SaleStatusCodeRef;
  notes: string | null;
  proofPaths: string[];
  proofCount: number;
  amount: string;
  stockBranchId: string;
  branch: { id: string; name: string };
  stockSourceBranch: { id: string; name: string } | null;
  paymentType: { id: string; name: string } | null;
  saleType: { id: string; name: string } | null;
  customerDeliveryMethod: { id: string; name: string } | null;
  returnRequest: { id: string; status: string } | null;
  returnStatusCode: SaleStatusCodeRef | null;
  createdByName: string | null;
  lines: SaleDetailsLine[];
}

export type SaleReturnConfirmAction =
  | "request"
  | "evaluate"
  | "approve"
  | "reject"
  | "restore";

interface SaleDetailsDialogProps {
  sale: SaleDetailsPayload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capabilities: SalesActionCapabilities;
  pending?: boolean;
  onEditLine: (line: SaleDetailsLine) => void;
  onReturnAction: (action: SaleReturnConfirmAction) => void;
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

function formatBrandModel(
  brandName: string | null,
  modelLabel: string | null,
): string {
  const brand = brandName?.trim() || null;
  const model = modelLabel?.trim() || null;
  if (brand && model) return `${brand} · ${model}`;
  return brand ?? model ?? "—";
}

function SaleProofReview({
  saleId,
  proofPaths,
}: {
  saleId: string;
  proofPaths: string[];
}) {
  if (proofPaths.length === 0) {
    return <span>None</span>;
  }

  if (proofPaths.length === 1) {
    const path = proofPaths[0]!;
    return (
      <a
        href={saleProofViewUrl(saleId, 0)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
      >
        Review proof
        <ExternalLink className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">({saleProofFileName(path)})</span>
      </a>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto gap-1 px-0 text-sm"
        >
          {proofPaths.length} attachments — review
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-70 w-72 p-2" align="end">
        <ul className="space-y-1">
          {proofPaths.map((path, index) => (
            <li key={`${path}-${index}`}>
              <a
                href={saleProofViewUrl(saleId, index)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-primary underline-offset-4 hover:bg-muted hover:underline"
              >
                <span className="min-w-0 truncate">
                  {saleProofFileName(path)}
                </span>
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function SaleDetailsDialog({
  sale,
  open,
  onOpenChange,
  capabilities,
  pending = false,
  onEditLine,
  onReturnAction,
}: SaleDetailsDialogProps) {
  const dateLabel = formatOptionalDate(sale.transactionDate);
  const totalLines = sale.lines.length;
  const returnStatus = sale.returnRequest?.status;
  const showRequestReturn =
    !sale.returnRequest &&
    sale.atrStatus === "open" &&
    capabilities.canRequestReturn;
  const showCsActions =
    returnStatus === "pending_cs" && capabilities.canEvaluateReturn;
  const showTlActions =
    returnStatus === "pending_tl" && capabilities.canApproveReturn;
  const showRestore =
    returnStatus === "approved" && capabilities.canCompleteReturn;
  const hasAtrActions =
    showRequestReturn || showCsActions || showTlActions || showRestore;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] w-[min(calc(100vw-2rem),48rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>Sale details {sale.transactionNo}</DialogTitle>
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
                  saleId={sale.id}
                  proofPaths={sale.proofPaths}
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
            <div className="min-h-0 max-h-80 w-full flex-1 overflow-auto rounded-md border sm:max-h-105">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur-sm">
                  <tr>
                    <th className="w-px whitespace-nowrap px-2 py-2 text-left font-medium">
                      #
                    </th>
                    <th className="w-px whitespace-nowrap px-2 py-2 text-left font-medium">
                      Package
                    </th>
                    <th className="min-w-0 px-2 py-2 text-left font-medium">
                      Brand / Model
                    </th>
                    <th className="w-px whitespace-nowrap px-2 py-2 text-left font-medium">
                      SN
                    </th>
                    <th className="w-px whitespace-nowrap px-2 py-2 text-right font-medium">
                      Sale
                    </th>
                    <th className="w-px whitespace-nowrap px-2 py-2 text-right font-medium">
                      Model price
                    </th>
                    <th className="sticky right-0 w-px whitespace-nowrap bg-muted/95 px-2 py-2 text-right font-medium shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                      Edit
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
                        className="max-w-36 truncate whitespace-nowrap px-2 py-2"
                        title={line.packageName ?? undefined}
                      >
                        {line.packageName ?? "—"}
                      </td>
                      <td
                        className="min-w-0 truncate px-2 py-2 font-mono text-xs"
                        title={formatBrandModel(line.brandName, line.modelLabel)}
                      >
                        {formatBrandModel(line.brandName, line.modelLabel)}
                      </td>
                      <td
                        className="max-w-40 truncate whitespace-nowrap px-2 py-2 font-mono text-xs"
                        title={line.serialNo}
                      >
                        {line.serialNo}
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
                      <td className="sticky right-0 whitespace-nowrap bg-card px-2 py-2 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => onEditLine(line)}
                        >
                          Edit
                        </Button>
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
            {showRequestReturn ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onReturnAction("request")}
              >
                Request return
              </Button>
            ) : null}
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
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
