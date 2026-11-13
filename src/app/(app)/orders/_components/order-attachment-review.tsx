"use client";

import { useState } from "react";

import { SaleProofViewerDialog } from "@/app/(app)/sales/_components/sale-proof-viewer-dialog";
import { Button } from "@/components/ui/button";
import { orderAttachmentFileHref } from "@/features/orders/constants/order-attachments";

/** Opens the sale proof preview for the paths saved on an order. */
export function OrderAttachmentReview({
  orderId,
  paths,
}: {
  orderId: string;
  paths: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  if (paths.length === 0) {
    return <span className="text-muted-foreground">No files attached.</span>;
  }

  return (
    <>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 text-sm"
        onClick={() => setOpen(true)}
      >
        {paths.length === 1 ? "Review attachment" : `${paths.length} attachments — review`}
      </Button>
      <SaleProofViewerDialog
        key={`${orderId}-${open ? "open" : "closed"}`}
        proofPaths={[...paths]}
        open={open}
        onOpenChange={setOpen}
        fileHref={(index) => orderAttachmentFileHref(orderId, index)}
        title="Attachments"
        singleFileDescription="Preview the file attached to this order."
        listLabel="Order attachments"
        previousLabel="Previous attachment"
        nextLabel="Next attachment"
      />
    </>
  );
}
