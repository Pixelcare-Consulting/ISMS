"use client";

import { useRouter } from "next/navigation";

import {
  LogisticsDocumentHeader,
  LogisticsDoneLine,
  LogisticsProgressCard,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { TransferForm } from "@/app/(app)/logistics/_components/transfer-form";
import {
  TransferTracker,
  transferFinishedSteps,
  type TransferFinishedStep,
} from "@/app/(app)/logistics/_components/transfer-tracker";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

const DONE_TIME = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

function doneLineDetail(step: TransferFinishedStep): string | undefined {
  if (!step.at) return undefined;
  const date = new Date(step.at);
  const when = Number.isNaN(date.getTime()) ? step.at : DONE_TIME.format(date);
  if (!step.actor) return when;
  return `${step.actor} · ${when}`;
}

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
  const finished = transferFinishedSteps(detail.status, detail.history);

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
      {finished.length > 0 ? (
        <div className="space-y-2">
          {finished.map((step) => (
            <LogisticsDoneLine key={step.key} title={step.title} detail={doneLineDetail(step)} />
          ))}
        </div>
      ) : null}
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
