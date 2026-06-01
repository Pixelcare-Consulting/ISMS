"use client";

import { useState, useTransition } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/cn";

export interface PermissionToggleRequest {
  roleId: string;
  roleName: string;
  permissionSlug: string;
  permissionName: string;
  enabled: boolean;
}

interface PermissionToggleProps {
  roleId: string;
  roleName: string;
  permissionSlug: string;
  permissionName: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
  onToggleRequest: (request: PermissionToggleRequest) => void;
}

export function PermissionToggle({
  roleId,
  roleName,
  permissionSlug,
  permissionName,
  checked,
  disabled = false,
  pending = false,
  className,
  onToggleRequest,
}: PermissionToggleProps) {
  function onCheckedChange(nextChecked: boolean) {
    if (nextChecked === checked) return;

    onToggleRequest({
      roleId,
      roleName,
      permissionSlug,
      permissionName,
      enabled: nextChecked,
    });
  }

  return (
    <Checkbox
      checked={checked}
      disabled={disabled || pending}
      onCheckedChange={onCheckedChange}
      aria-label={`Toggle ${permissionName} for ${roleName}`}
      className={cn(pending && "opacity-50", className)}
    />
  );
}

interface UsePermissionChangeDialogResult {
  pendingChange: PermissionToggleRequest | null;
  isPending: boolean;
  openChangeDialog: (request: PermissionToggleRequest) => void;
  closeChangeDialog: () => void;
  confirmChange: () => void;
}

export function usePermissionChangeDialog(
  onSuccess: (change: PermissionToggleRequest) => void,
  onError: (message: string) => void,
  toggleAction: (input: {
    roleId: string;
    permissionSlug: string;
    enabled: boolean;
  }) => Promise<{ error?: string; success?: boolean }>,
): UsePermissionChangeDialogResult {
  const [pendingChange, setPendingChange] = useState<PermissionToggleRequest | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function openChangeDialog(request: PermissionToggleRequest) {
    setPendingChange(request);
  }

  function closeChangeDialog() {
    if (isPending) return;
    setPendingChange(null);
  }

  function confirmChange() {
    if (!pendingChange) return;

    startTransition(async () => {
      const result = await toggleAction({
        roleId: pendingChange.roleId,
        permissionSlug: pendingChange.permissionSlug,
        enabled: pendingChange.enabled,
      });

      if (result.error) {
        onError(result.error);
        setPendingChange(null);
        return;
      }

      onSuccess(pendingChange);
      setPendingChange(null);
    });
  }

  return {
    pendingChange,
    isPending,
    openChangeDialog,
    closeChangeDialog,
    confirmChange,
  };
}
