"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  TRANSFER_CREATE_FORM_ID,
  TransferDocumentActionButtons,
  TransferForm,
  hasTransferDocumentAction,
  type TransferCreateInput,
  type TransferCreateState,
  type TransferDocumentActions,
  type TransferFormHandle,
} from "@/app/(app)/logistics/_components/transfer-form";
import { getTransferDetailAction } from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EMPTY_DOCUMENT_ACTIONS: TransferDocumentActions = {
  canApprove: false,
  canReject: false,
  canRelease: false,
  pending: false,
};

interface TransferRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: TransferCreateInput) => Promise<{ error?: string; transferNo?: string }>;
  onCreated: () => void;
  currentUserName?: string;
  capabilities?: LogisticsActionCapabilities;
  branchScope?: string[] | null;
  transferId?: string | null;
  onUpdated?: () => void;
}

export function TransferRequestDialog({
  open,
  onOpenChange,
  onSubmit,
  onCreated,
  currentUserName = "",
  capabilities,
  branchScope = null,
  transferId = null,
  onUpdated,
}: TransferRequestDialogProps) {
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [createState, setCreateState] = useState<TransferCreateState>({
    pending: false,
    ready: false,
  });
  const [documentActions, setDocumentActions] = useState<TransferDocumentActions>(EMPTY_DOCUMENT_ACTIONS);
  const [reportedTransferId, setReportedTransferId] = useState<string | null>(null);
  const formRef = useRef<TransferFormHandle>(null);
  const viewing = Boolean(open && transferId);
  const detailReady = Boolean(viewing && detail && transferId && detail.id === transferId);
  const failed = Boolean(viewing && transferId && failedId === transferId);

  const handleCreateState = useCallback((next: TransferCreateState) => {
    setCreateState((current) =>
      current.pending === next.pending && current.ready === next.ready ? current : next,
    );
  }, []);

  const handleDocumentActions = useCallback((next: TransferDocumentActions) => {
    setReportedTransferId(transferId ?? null);
    setDocumentActions((current) =>
      current.canApprove === next.canApprove &&
      current.canReject === next.canReject &&
      current.canRelease === next.canRelease &&
      current.pending === next.pending
        ? current
        : next,
    );
  }, [transferId]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setCreateState({ pending: false, ready: false });
      setReportedTransferId(null);
      setDocumentActions(EMPTY_DOCUMENT_ACTIONS);
    }
    onOpenChange(next);
  }

  useEffect(() => {
    if (!open || !transferId) return;
    let cancelled = false;
    void getTransferDetailAction(transferId).then((result) => {
      if (cancelled) return;
      if ("error" in result && result.error) {
        setDetail(null);
        setLoadError(result.error);
        setFailedId(transferId);
        return;
      }
      if ("detail" in result && result.detail) {
        setDetail(result.detail);
        setLoadError(null);
        setFailedId(null);
        return;
      }
      setDetail(null);
      setLoadError("Transfer not found.");
      setFailedId(transferId);
    });
    return () => {
      cancelled = true;
    };
  }, [open, transferId, reloadToken]);

  const footerActions =
    detailReady && reportedTransferId === transferId ? documentActions : EMPTY_DOCUMENT_ACTIONS;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl sm:p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
          <DialogTitle>{viewing ? "Branch transfer" : "New transfer request"}</DialogTitle>
          <DialogDescription>
            {viewing
              ? "Review this transfer, then approve, release, accept, or delete when that step is yours."
              : "Choose the releasing branch, the receiving branch, and the serials to send."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {viewing && !detailReady && !failed ? (
            <p className="text-sm text-muted-foreground">Loading transfer…</p>
          ) : null}
          {failed ? (
            <p className="text-sm text-destructive">{loadError ?? "Transfer not found."}</p>
          ) : null}
          {open && !transferId ? (
            <TransferForm
              key="create"
              mode="create"
              currentUserName={currentUserName}
              onSubmit={onSubmit}
              onCreateStateChange={handleCreateState}
              onCreated={() => {
                handleOpenChange(false);
                onCreated();
              }}
            />
          ) : null}
          {detailReady && detail ? (
            <TransferForm
              ref={formRef}
              key={detail.id}
              mode="view"
              detail={detail}
              capabilities={capabilities}
              branchScope={branchScope}
              actionsPlacement="external"
              onDocumentActionsChange={handleDocumentActions}
              onUpdated={() => {
                setReloadToken((current) => current + 1);
                onUpdated?.();
              }}
            />
          ) : null}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:justify-end sm:px-6">
          {viewing ? (
            hasTransferDocumentAction(footerActions) ? (
              <TransferDocumentActionButtons
                actions={footerActions}
                onAction={(action) => formRef.current?.openDocumentAction(action)}
              />
            ) : (
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            )
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={createState.pending}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form={TRANSFER_CREATE_FORM_ID}
                disabled={createState.pending || !createState.ready}
              >
                Submit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
