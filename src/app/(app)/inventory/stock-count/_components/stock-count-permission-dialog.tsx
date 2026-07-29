"use client";

import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STOCK_COUNT_PERMISSION_MESSAGE } from "@/features/stock-audit/constants/stock-count-permissions";

interface StockCountPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockCountPermissionDialog({
  open,
  onOpenChange,
}: StockCountPermissionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-destructive/30 p-0 sm:max-w-sm">
        <div className="h-1.5 bg-destructive" />
        <div className="space-y-5 px-6 pb-6">
          <DialogHeader className="items-center pt-2 text-center sm:text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 ring-8 ring-destructive/5">
              <ShieldAlert className="size-7 text-destructive" aria-hidden />
            </div>
            <div className="space-y-2 pt-2">
              <DialogTitle className="text-xl text-destructive">
                Permission denied
              </DialogTitle>
              <DialogDescription className="mx-auto max-w-xs leading-relaxed">
                {STOCK_COUNT_PERMISSION_MESSAGE}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="w-full"
              variant="destructive"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
