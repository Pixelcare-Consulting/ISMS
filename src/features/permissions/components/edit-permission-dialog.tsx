"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { toast } from "sonner";

import { parsePermissionSlug } from "@/config/app-modules";
import { updatePermissionAction } from "@/features/permissions/actions/permission.actions";
import { PermissionModuleFields } from "@/features/permissions/components/permission-module-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permission: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
  } | null;
}

export function EditPermissionDialog({
  open,
  onOpenChange,
  permission,
}: EditPermissionDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(permission?.name ?? "");
  const [description, setDescription] = useState(permission?.description ?? "");
  const [pending, startTransition] = useTransition();

  const linkage = useMemo(
    () => parsePermissionSlug(permission?.slug ?? ""),
    [permission?.slug],
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permission) {
      return;
    }

    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("permissionId", permission.id);

    startTransition(async () => {
      const result = await updatePermissionAction(formData);
      if (result.error) {
        setError(result.error);
        toast.error("Could not update permission", { description: result.error });
        return;
      }

      toast.success("Permission updated");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit permission</DialogTitle>
          <DialogDescription>
            Module linkage is fixed after creation. Update the display name or
            description only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <PermissionModuleFields
            modules={[]}
            moduleId=""
            action=""
            slug={permission?.slug ?? ""}
            onModuleChange={() => undefined}
            onActionChange={() => undefined}
            readOnly
            linkedModule={linkage.module}
            linkedAction={linkage.action}
          />

          <div className="space-y-2">
            <Label htmlFor="edit-permission-name">Name</Label>
            <Input
              id="edit-permission-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-permission-description">Description</Label>
            <Input
              id="edit-permission-description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
              maxLength={200}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
