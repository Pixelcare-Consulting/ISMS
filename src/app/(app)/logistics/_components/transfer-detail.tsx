"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DocumentDetailBand } from "@/app/(app)/logistics/_components/logistics-detail-ui";
import {
  hasTransferDocumentAction,
  TransferDocumentActionButtons,
  TransferForm,
  type TransferDocumentActions,
  type TransferFormHandle,
} from "@/app/(app)/logistics/_components/transfer-form";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
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
}: {
  detail: TransferDetail;
  capabilities: LogisticsActionCapabilities;
  branchScope: string[] | null;
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
        statusLine={detail.status.name}
        actions={
          hasTransferDocumentAction(documentActions) ? (
            <TransferDocumentActionButtons
              actions={documentActions}
              onAction={(action) => formRef.current?.openDocumentAction(action)}
            />
          ) : null
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
        onDocumentActionsChange={setDocumentActions}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
