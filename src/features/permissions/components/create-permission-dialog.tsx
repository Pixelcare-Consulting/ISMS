"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { appModules } from "@/config/app-modules";
import { createPermissionAction } from "@/features/permissions/actions/permission.actions";
import {
  buildPermissionDefaults,
  PermissionModuleFields,
} from "@/features/permissions/components/permission-module-fields";
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

const defaultModuleId = appModules[0]?.id ?? "";
const defaultAction = appModules[0]?.actions[0]?.value ?? "";

export function CreatePermissionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moduleId, setModuleId] = useState(defaultModuleId);
  const [action, setAction] = useState(defaultAction);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  const defaults = useMemo(
    () => buildPermissionDefaults(moduleId, action),
    [moduleId, action],
  );

  const displayName = nameTouched ? name : defaults.name || name;

  function resetForm() {
    setError(null);
    setModuleId(defaultModuleId);
    setAction(defaultAction);
    setName("");
    setNameTouched(false);
  }

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set("moduleId", moduleId);
    formData.set("action", action);
    formData.set("name", displayName);
    formData.set("slug", defaults.slug);

    startTransition(async () => {
      const result = await createPermissionAction(formData);
      if (result.error) {
        setError(result.error);
        toast.error("Could not create permission", { description: result.error });
        return;
      }

      toast.success("Permission created", {
        description: "Assign it on Roles to grant access to the linked module.",
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add permission
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add permission</DialogTitle>
            <DialogDescription>
              Pick a module and action. The slug is generated automatically and
              links to that module&apos;s route and sidebar entry.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <PermissionModuleFields
              modules={appModules}
              moduleId={moduleId}
              action={action}
              slug={defaults.slug}
              onModuleChange={setModuleId}
              onActionChange={setAction}
            />
            <input type="hidden" name="moduleId" value={moduleId} />
            <input type="hidden" name="action" value={action} />
            <input type="hidden" name="slug" value={defaults.slug} />

            <div className="space-y-2">
              <Label htmlFor="permission-name">Name</Label>
              <Input
                id="permission-name"
                name="name"
                value={displayName}
                onChange={(event) => {
                  setNameTouched(true);
                  setName(event.target.value);
                }}
                required
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="permission-description">Description</Label>
              <Input
                id="permission-description"
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
              <Button type="submit" disabled={pending || !defaults.slug}>
                {pending ? "Creating…" : "Create permission"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
