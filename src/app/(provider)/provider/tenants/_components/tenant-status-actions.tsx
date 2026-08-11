"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  disableProviderCustomerAction,
  restoreProviderCustomerAction,
} from "@/features/provider/actions/provider.actions";

interface TenantStatusActionsProps {
  tenantId: string;
  tenantName: string;
  status: "active" | "disabled";
  /** Compact buttons for table row actions */
  compact?: boolean;
}

export function TenantStatusActions({
  tenantId,
  tenantName,
  status,
  compact = false,
}: TenantStatusActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runAction(kind: "disable" | "restore") {
    setError(null);
    startTransition(async () => {
      const result =
        kind === "disable"
          ? await disableProviderCustomerAction(tenantId)
          : await restoreProviderCustomerAction(tenantId);

      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(
        kind === "disable"
          ? "Organization disabled"
          : "Organization restored",
      );
      router.refresh();
    });
  }

  const buttonSize = compact ? "sm" : "default";
  const disableLabel = compact ? "Disable" : "Disable organization";
  const restoreLabel = compact ? "Restore" : "Restore organization";

  if (status === "active") {
    return (
      <div className={compact ? undefined : "space-y-2"}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size={buttonSize}
              disabled={pending}
            >
              {disableLabel}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disable {tenantName}?</AlertDialogTitle>
              <AlertDialogDescription>
                Users in this organization will not be able to sign in or use
                the app until you restore access.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={() => runAction("disable")}
              >
                Disable
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {!compact && error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={compact ? undefined : "space-y-2"}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" size={buttonSize} disabled={pending}>
            {restoreLabel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {tenantName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Users will be able to sign in again and use the tenant app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => runAction("restore")}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!compact && error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
