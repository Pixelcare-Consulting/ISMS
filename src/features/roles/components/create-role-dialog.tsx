"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createRoleAction } from "@/features/roles/actions/role.actions";
import { slugifyRoleName } from "@/features/roles/constants/role.constants";
import { useSettingsUi } from "@/hooks/use-settings-ui";
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

export function CreateRoleDialog() {
  const router = useRouter();
  const { isRoleDialogOpen, setRoleDialogOpen } = useSettingsUi();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => setRoleDialogOpen(false);
  }, [setRoleDialogOpen]);

  function resetForm() {
    setError(null);
    setName("");
    setSlug("");
    setSlugTouched(false);
  }

  function onOpenChange(open: boolean) {
    setRoleDialogOpen(open);
    if (!open) {
      resetForm();
    }
  }

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugifyRoleName(value));
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (slug.trim()) {
      formData.set("slug", slug.trim());
    }

    startTransition(async () => {
      const result = await createRoleAction(formData);
      if (result.error) {
        setError(result.error);
        toast.error("Could not create role", { description: result.error });
        return;
      }
      toast.success("Role created", {
        description: `${name.trim()} was added to your organization.`,
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setRoleDialogOpen(true)}>
        <Plus className="size-4" />
        Add role
      </Button>

      <Dialog open={isRoleDialogOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add role</DialogTitle>
            <DialogDescription>
              Create a custom role and configure its permissions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                name="name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Compliance reviewer"
                required
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-slug">Slug</Label>
              <Input
                id="role-slug"
                name="slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder="compliance_reviewer"
                maxLength={48}
              />
              <p className="text-xs text-muted-foreground">
                Used internally. Auto-generated from the name if left blank.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-description">Description</Label>
              <Input
                id="role-description"
                name="description"
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
                {pending ? "Creating…" : "Create role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
