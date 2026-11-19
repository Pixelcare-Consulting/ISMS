"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import type { listScOrdersAction } from "@/features/service-center-ops/actions/sc-orders.actions";

type ScOrderRow = Awaited<ReturnType<typeof listScOrdersAction>>["items"][number];

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

export function ScOrderDetailsDialog({
  order,
  onOpenChange,
}: {
  order: ScOrderRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const drNos = order?.deliveries.map((delivery) => delivery.sapDocNo).filter(Boolean) ?? [];

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {order ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {order.orderNumber}
                <Badge variant="secondary">{BRANCH_ORDER_STATUS_LABELS[order.status]}</Badge>
              </DialogTitle>
              <DialogDescription>{order.serviceCenter.name}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Location" value={order.serviceCenterLocation?.name} />
              <Field label="Customer" value={order.sapCardCode} />
              <Field label="PO number" value={order.poNumber} />
              <Field label="Project" value={order.projectCode} />
              <Field label="SO no." value={order.sapDocNum} />
              <Field label="DR no." value={drNos.join(", ")} />
              <Field label="Created" value={new Date(order.createdAt).toLocaleString()} />
            </dl>
            {order.notes ? (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Approved</th>
                    <th className="px-3 py-2 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {order.details.map((detail) => (
                    <tr key={detail.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{detail.model.skuCode}</td>
                      <td className="px-3 py-2">{detail.model.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{detail.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {detail.approvedQty ?? "—"}
                      </td>
                      <td className="px-3 py-2">{detail.remarks ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
