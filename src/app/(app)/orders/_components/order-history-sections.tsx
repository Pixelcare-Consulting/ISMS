"use client";

import { FileText, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

import {
  LogisticsInfoCard,
  LogisticsTimeline,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";

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
