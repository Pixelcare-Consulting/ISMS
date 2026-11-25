"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** A server action's result is `{ error }` on failure; any other shape is success. */
type Succeeded<R> = Exclude<R, { error: string }>;

function actionError(result: object): string | null {
  return "error" in result && typeof result.error === "string" ? result.error : null;
}

/**
 * A destructive action behind a confirm dialog: runs the server action, toasts the outcome,
 * and refreshes the page. The dialog stays open while it runs so it cannot be sent twice.
 */
export function ConfirmActionButton<R extends object>({
  label,
  title,
  description,
  confirmLabel,
  pendingLabel,
  keepLabel = "Keep it",
  run,
  successMessage,
  size = "default",
}: {
  label: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  keepLabel?: string;
  run: () => Promise<R>;
  successMessage: (result: Succeeded<R>) => string;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await run();
      const error = actionError(result);
      if (error !== null) {
        toast.error(error);
        return;
      }
      toast.success(successMessage(result as Succeeded<R>));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size={size} variant="outline" className="max-sm:h-11" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{keepLabel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                confirm();
              }}
            >
              {pending ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
