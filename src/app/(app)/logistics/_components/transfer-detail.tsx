"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import {
  TransferDocumentActionButtons,
  TransferForm,
  type TransferDocumentActions,
  type TransferFormHandle,
} from "@/app/(app)/logistics/_components/transfer-form";
import { TransferTracker } from "@/app/(app)/logistics/_components/transfer-tracker";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

const EMPTY_DOCUMENT_ACTIONS: TransferDocumentActions = {
  canApprove: false,
  canReject: false,
  canRelease: false,
  pending: false,
};

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
  const formRef = useRef<TransferFormHandle>(null);
  const [documentActions, setDocumentActions] = useState<TransferDocumentActions>(EMPTY_DOCUMENT_ACTIONS);

  const handleDocumentActions = useCallback((next: TransferDocumentActions) => {
    setDocumentActions((current) =>
      current.canApprove === next.canApprove &&
      current.canReject === next.canReject &&
      current.canRelease === next.canRelease &&
      current.pending === next.pending
        ? current
        : next,
    );
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/logistics/transfers" className="text-sm text-muted-foreground hover:underline">
          Back to transfers
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-semibold">{detail.transferNo}</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusCodeBadge
                code={detail.status.code}
                name={detail.status.name}
                color={detail.status.color}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <TransferDocumentActionButtons
              actions={documentActions}
              onAction={(action) => formRef.current?.openDocumentAction(action)}
            />
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <TransferTracker status={detail.status} history={detail.history} />
      </div>
      <TransferForm
        ref={formRef}
        mode="view"
        layout="page"
        detail={detail}
        capabilities={capabilities}
        branchScope={branchScope}
        actionsPlacement="external"
        onDocumentActionsChange={handleDocumentActions}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
