import type { SaleReturnConfirmAction } from "@/app/(app)/sales/_components/sale-details-dialog";

export type SaleReturnPendingConfirm = {
  saleId: string;
  returnRequestId?: string;
  transactionNo: string;
  branchName: string;
  action: SaleReturnConfirmAction;
};

export const SALE_RETURN_CONFIRM_COPY: Record<
  SaleReturnConfirmAction,
  { title: string; description: string; confirmLabel: string; successMessage: string }
> = {
  request: {
    title: "Are you sure you want to request a return?",
    description:
      "This starts an ATR return for this sale and sends it for CS evaluation.",
    confirmLabel: "Request return",
    successMessage: "Return request submitted",
  },
  evaluate: {
    title: "Are you sure you want to complete CS evaluation?",
    description:
      "This marks CS evaluation complete. Dealer Initiated types still need Team Leader approve; other document types move straight to Approved.",
    confirmLabel: "CS evaluate",
    successMessage: "CS evaluation complete",
  },
  approve: {
    title: "Are you sure you want to approve this return?",
    description:
      "This TL-approves the Dealer Initiated return so inventory can be restored or replaced.",
    confirmLabel: "TL approve",
    successMessage: "TL approved return",
  },
  reject: {
    title: "Are you sure you want to reject this return?",
    description:
      "This rejects the return request and closes the ATR workflow for this sale.",
    confirmLabel: "Reject",
    successMessage: "Return rejected",
  },
  restore: {
    title: "Are you sure you want to restore stock?",
    description:
      "This restores inventory for the selected serial on this return and closes the ATR. Other serials on the package stay unchanged.",
    confirmLabel: "Restore stock",
    successMessage: "Inventory restored — ATR closed",
  },
  complete_replacement: {
    title: "Complete replacement?",
    description:
      "This opens Same Invoice or New Invoice so you can finish the replacement and close the ATR.",
    confirmLabel: "Continue",
    successMessage: "Replacement completed",
  },
};
