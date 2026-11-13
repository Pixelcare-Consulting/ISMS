"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DocumentDetailBand } from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { SlipPrintButton } from "@/app/(app)/logistics/_components/shipment-print-button";
import {
  hasTransferDocumentAction,
  TransferDocumentActionButtons,
  TransferForm,
  type TransferDocumentActions,
  type TransferFormHandle,
} from "@/app/(app)/logistics/_components/transfer-form";
import { transferPrintDocument } from "@/app/(app)/logistics/_components/transfer-print";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { WorkflowStatusOption } from "@/features/logistics/constants/workflow-codes";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";

const NO_DOCUMENT_ACTIONS: TransferDocumentActions = {
  canApprove: false,
  canReject: false,
  canRelease: false,
  pending: false,
};

export function TransferDetailView({
  detail,
  capabilities,
  branchScope,
  approvalBranchIds,
  workflowStatuses,
}: {
  detail: TransferDetail;
  capabilities: LogisticsActionCapabilities;
  branchScope: string[] | null;
  approvalBranchIds: string[] | null;
  workflowStatuses: readonly WorkflowStatusOption[];
}) {
  const router = useRouter();
  const formRef = useRef<TransferFormHandle>(null);
  const [documentActions, setDocumentActions] = useState<TransferDocumentActions>(NO_DOCUMENT_ACTIONS);

  return (
    <div className="space-y-6">
      <DocumentDetailBand
        backHref="/logistics/transfers"
        backLabel="Back to transfers"
        title={detail.transferNo}
        statusLine={
          <StatusCodeBadge
            code={detail.status.code}
            name={detail.status.name}
            color={detail.status.color}
          />
        }
        actions={
          <>
            {hasTransferDocumentAction(documentActions) ? (
              <TransferDocumentActionButtons
                actions={documentActions}
                onAction={(action) => formRef.current?.openDocumentAction(action)}
              />
            ) : null}
            <SlipPrintButton slips={transferPrintDocument(detail)} />
          </>
        }
      />
      <TransferForm
        ref={formRef}
        mode="view"
        layout="page"
        actionsPlacement="external"
        detail={detail}
        capabilities={capabilities}
        branchScope={branchScope}
        approvalBranchIds={approvalBranchIds}
        workflowStatuses={workflowStatuses}
        onDocumentActionsChange={setDocumentActions}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
