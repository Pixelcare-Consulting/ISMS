"use client";

import { useRouter } from "next/navigation";

import {
  LogisticsDocumentHeader,
  LogisticsProgressCard,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { TransferForm } from "@/app/(app)/logistics/_components/transfer-form";
import { TransferTracker } from "@/app/(app)/logistics/_components/transfer-tracker";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

export function TransferDetailView({
  detail,
  capabilities,
  branchScope,
}: {
  detail: TransferDetail;
  capabilities: LogisticsActionCapabilities;
  branchScope: string[] | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <LogisticsDocumentHeader
        backHref="/logistics/transfers"
        backLabel="Back to transfers"
        context="Branch transfer"
        title={detail.transferNo}
        statusCode={detail.status.code}
        statusColor={detail.status.color}
        badges={
          <StatusCodeBadge
            code={detail.status.code}
            name={detail.status.name}
            color={detail.status.color}
          />
        }
      />
      <LogisticsProgressCard>
        <TransferTracker status={detail.status} history={detail.history} />
      </LogisticsProgressCard>
      <TransferForm
        mode="view"
        layout="page"
        detail={detail}
        capabilities={capabilities}
        branchScope={branchScope}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
