"use client";

import { useMemo } from "react";

import {
  CompactLineTable,
  CompactModelCell,
  type CompactLineColumn,
} from "@/components/compact-line-table";
import { worksheetTotalsLabel } from "@/features/orders/lib/order-worksheet-filters";
import { formatPeso } from "@/utils/format-currency";

/** One model on an opened order. Amount is shown only when the order stored one. */
export interface OrderHistoryTableLine {
  id: string;
  skuCode: string;
  name: string;
  quantity: number;
  amount: number | null;
}

export function OrderHistoryLinesTable({ lines }: { lines: OrderHistoryTableLine[] }) {
  const showAmount = lines.some((line) => line.amount != null);
  const columns = useMemo(() => {
    const next: CompactLineColumn<OrderHistoryTableLine>[] = [
      {
        id: "model",
        header: "Model",
        cell: (line) => <CompactModelCell code={line.skuCode} name={line.name} />,
      },
      {
        id: "quantity",
        header: "Quantity",
        align: "right",
        className: "w-28 tabular-nums",
        cell: (line) => line.quantity.toLocaleString(),
      },
    ];
    if (showAmount) {
      next.push({
        id: "amount",
        header: "Amount",
        align: "right",
        className: "w-36 tabular-nums",
        cell: (line) => (line.amount == null ? "—" : formatPeso(line.amount)),
      });
    }
    return next;
  }, [showAmount]);

  return (
    <CompactLineTable
      rows={lines}
      getRowId={(line) => line.id}
      columns={columns}
      searchText={(line) => [line.skuCode, line.name, String(line.quantity)]}
      itemLabel="model"
      emptyMessage="No models on this order."
      noMatchMessage="No models match."
      summaryFor={(visible) => {
        const quantity = visible.reduce((sum, line) => sum + line.quantity, 0);
        const base = worksheetTotalsLabel(visible.length, quantity);
        const amounts = visible.map((line) => line.amount);
        const totalAmount =
          showAmount && amounts.every((amount) => amount != null)
            ? amounts.reduce((sum, amount) => sum + (amount ?? 0), 0)
            : null;
        return totalAmount == null ? base : `${base} · ${formatPeso(totalAmount)}`;
      }}
    />
  );
}
