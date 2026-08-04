"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SaleSerialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionNo: string;
  serialNumbers: string[];
}

export function SaleSerialsDialog({
  open,
  onOpenChange,
  transactionNo,
  serialNumbers,
}: SaleSerialsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Serial numbers</DialogTitle>
          <DialogDescription>
            {serialNumbers.length} serial
            {serialNumbers.length === 1 ? "" : "s"} on transaction{" "}
            <span className="font-mono text-foreground">{transactionNo}</span>
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border bg-muted/30 p-3">
          {serialNumbers.map((serialNo, index) => (
            <li
              key={`${serialNo}-${index}`}
              className="flex items-center gap-3 font-mono text-sm"
            >
              <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                {index + 1}.
              </span>
              <span>{serialNo}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
