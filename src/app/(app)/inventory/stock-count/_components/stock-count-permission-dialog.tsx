"use client";

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permission denied</DialogTitle>
          <DialogDescription>{STOCK_COUNT_PERMISSION_MESSAGE}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
