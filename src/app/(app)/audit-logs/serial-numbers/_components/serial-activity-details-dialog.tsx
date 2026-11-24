"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SerialActivityStatusBadge } from "@/features/serial-activity/components/serial-activity-status-badge";
import {
  formatSerialActivityApproval,
  formatSerialActivityPerformedBy,
  formatSerialActivityTimestamp,
  formatSerialActivityType,
  type SerialActivityEvent,
} from "@/features/serial-activity/constants/serial-activity-display";
import { replacementSerialReferenceLines } from "@/features/serial-activity/lib/replacement-reference";
import { transactionReferenceLines } from "@/features/serial-activity/lib/transaction-snapshot";

function coveredReferenceLines(event: SerialActivityEvent): Set<string> {
  return new Set([
    ...transactionReferenceLines(event.transaction),
    ...replacementSerialReferenceLines(
      event.serialPair?.returnedSerialNo,
      event.serialPair?.replacedSerialNo,
    ),
    ...(event.approvals ?? []).map((approval) => formatSerialActivityApproval(approval)),
  ]);
}

function Detail({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: ReactNode;
}) {
  const text = value?.trim() ? value : null;
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children ?? text ?? "—"}</dd>
    </div>
  );
}

export function SerialActivityDetailsDialog({
  event,
  onOpenChange,
}: {
  event: SerialActivityEvent;
  onOpenChange: (open: boolean) => void;
}) {
  const transaction = event.transaction ?? null;
  const hasTransaction = Boolean(
    transaction &&
      (transaction.transactionNo ||
        transaction.transactionDate ||
        transaction.amount ||
        transaction.customerName ||
        transaction.customerNumber),
  );
  const pair = event.serialPair ?? null;
  const approvals = event.approvals ?? [];
  const remaining = event.referenceDetails.filter((line) => !coveredReferenceLines(event).has(line));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>View details</DialogTitle>
          <DialogDescription>Read-only record for this serial number log.</DialogDescription>
        </DialogHeader>

        <dl className="space-y-2">
          <Detail label="Event" value={formatSerialActivityType(event)} />
          <Detail label="Date and time" value={formatSerialActivityTimestamp(event.timestamp)} />
          <Detail label="Serial" value={event.serialNo} />
          <Detail label="Model" value={event.modelLabel} />
          <Detail label="Status">
            {event.status?.trim() ? <SerialActivityStatusBadge status={event.status} /> : "—"}
          </Detail>
          <Detail label="Location" value={event.location} />
          <Detail label="Performed by" value={formatSerialActivityPerformedBy(event.performedBy)} />
        </dl>

        {hasTransaction && transaction ? (
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Transaction</h3>
            <dl className="space-y-2">
              <Detail label="Transaction number" value={transaction.transactionNo} />
              <Detail label="Transaction date" value={transaction.transactionDate} />
              <Detail label="Transaction amount" value={transaction.amount} />
              <Detail label="Customer" value={transaction.customerName} />
              <Detail label="Customer number" value={transaction.customerNumber} />
            </dl>
          </section>
        ) : null}

        {pair ? (
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Serials</h3>
            <dl className="space-y-2">
              <Detail label="Returned SN" value={pair.returnedSerialNo} />
              <Detail label="Replaced SN" value={pair.replacedSerialNo} />
            </dl>
          </section>
        ) : null}

        {approvals.length > 0 ? (
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Approvals</h3>
            <ul className="space-y-3">
              {approvals.map((approval) => (
                <li
                  key={`${approval.action}-${approval.when}-${approval.person ?? ""}`}
                  className="grid grid-cols-[9.5rem_1fr] gap-x-3 text-sm"
                >
                  <span className="text-muted-foreground">{approval.action}</span>
                  <span>
                    <span>{approval.person ?? "—"}</span>
                    <span className="mt-0.5 block text-muted-foreground">{approval.when}</span>
                    {approval.note ? (
                      <span className="mt-0.5 block">Note: {approval.note}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {remaining.length > 0 ? (
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Reference</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {remaining.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
