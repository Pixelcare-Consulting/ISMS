"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toast } from "sonner";

import { updateRoleAction } from "@/features/roles/actions/role.actions";
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

interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
  } | null;
}

export function EditRoleDialog({ open, onOpenChange, role }: EditRoleDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) {
      return;
    }

    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("roleId", role.id);

    startTransition(async () => {
      const result = await updateRoleAction(formData);
      if (result.error) {
        setError(result.error);
        toast.error("Could not update role", { description: result.error });
        return;
      }

      toast.success("Role updated");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
          <DialogDescription>
            Update this role&apos;s name and description.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-role-name">Name</Label>
            <Input
              id="edit-role-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-role-slug">Slug</Label>
            <Input id="edit-role-slug" value={role?.slug ?? ""} disabled readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-role-description">Description</Label>
            <Input
              id="edit-role-description"
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
