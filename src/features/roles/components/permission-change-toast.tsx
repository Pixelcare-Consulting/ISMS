import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

interface PermissionChangeToastInput {
  roleName: string;
  permissionName: string;
  enabled: boolean;
}

export function showPermissionChangeToast({
  roleName,
  permissionName,
  enabled,
}: PermissionChangeToastInput) {
  toast.success(enabled ? "Permission granted" : "Permission revoked", {
    description: enabled
      ? `"${permissionName}" was added to ${roleName}.`
      : `"${permissionName}" was removed from ${roleName}.`,
    icon: enabled ? (
      <ShieldCheck className="size-4 text-primary" />
    ) : (
      <ShieldOff className="size-4 text-muted-foreground" />
    ),
    duration: 4000,
  });
}

export function showPermissionChangeError(message: string) {
  toast.error("Could not update permission", {
    description: message,
    duration: 5000,
  });
}
