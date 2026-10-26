"use client";

import { FileText, ListChecks, Truck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  LogisticsInfoCard,
  LogisticsTimeline,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import type { OrderHistoryLinkedDelivery } from "@/features/orders/types/order-analytics";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

export interface OrderApprovalTimelineItem {
  id: string;
  title: string;
  pending: boolean;
  subtitle: string | null;
  note: string | null;
}

export function OrderHistoryFactsCard({ children }: { children: ReactNode }) {
  return (
    <LogisticsInfoCard title="Order" icon={FileText} tone="sky">
      {children}
    </LogisticsInfoCard>
  );
}

export function OrderLinkedDeliveryCard({ delivery }: { delivery: OrderHistoryLinkedDelivery }) {
  const number = delivery.deliveryNo.trim();
  const statusName = delivery.status.name.trim() || delivery.status.code;

  return (
    <LogisticsInfoCard title="Linked delivery" icon={Truck} tone="sky">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium">{number || "Delivery"}</p>
          <StatusCodeBadge
            code={delivery.status.code}
            name={statusName}
            color={delivery.status.color}
          />
        </div>
        <Link
          href={`/logistics/deliveries/${delivery.id}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open delivery
        </Link>
      </div>
    </LogisticsInfoCard>
  );
}

export function OrderHistoryApprovals({ items }: { items: OrderApprovalTimelineItem[] }) {
  return (
    <LogisticsInfoCard title="Approvals" icon={ListChecks} tone="amber">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No approval has been recorded.</p>
      ) : (
        <LogisticsTimeline items={items} />
      )}
    </LogisticsInfoCard>
  );
}
