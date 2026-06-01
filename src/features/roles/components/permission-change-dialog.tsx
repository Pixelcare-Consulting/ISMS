import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PermissionChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleName: string;
  permissionName: string;
  enabled: boolean;
  pending: boolean;
  onConfirm: () => void;
}

export function PermissionChangeDialog({
  open,
  onOpenChange,
  roleName,
  permissionName,
  enabled,
  pending,
  onConfirm,
}: PermissionChangeDialogProps) {
  const actionLabel = enabled ? "Grant permission" : "Revoke permission";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            {enabled
              ? `Add "${permissionName}" to the ${roleName} role?`
              : `Remove "${permissionName}" from the ${roleName} role?`}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Users with this role will {enabled ? "gain" : "lose"} access immediately
          after you confirm.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
