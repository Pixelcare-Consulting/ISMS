"use client";

import { useState, type ReactNode } from "react";

import { PaginatedReleaseList } from "@/app/(auth)/_components/paginated-release-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface WhatsNewDialogProps {
  trigger: ReactNode;
}

export function WhatsNewDialog({ trigger }: WhatsNewDialogProps) {
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDialogKey((current) => current + 1);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="shrink-0 space-y-1.5 border-b bg-card px-6 py-5 text-left">
          <DialogTitle>What&apos;s new</DialogTitle>
          <DialogDescription>
            Release notes and product updates for FINDEN ISMS.
          </DialogDescription>
        </DialogHeader>
        <PaginatedReleaseList key={dialogKey} />
      </DialogContent>
    </Dialog>
  );
}
