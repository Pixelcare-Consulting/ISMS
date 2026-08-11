"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { ProviderUserRow } from "@/app/(provider)/provider/tenants/_components/create-provider-user-dialog";
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
import { PasswordInput } from "@/components/ui/password-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateProviderCustomerUserAction } from "@/features/provider/actions/provider.actions";

interface RoleOption {
  slug: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface EditProviderUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  user: ProviderUserRow | null;
  roles: RoleOption[];
  departments: DepartmentOption[];
  onUpdated?: (user: ProviderUserRow) => void;
}

export function EditProviderUserDialog({
  open,
  onOpenChange,
  tenantId,
  user,
  roles,
  departments,
  onUpdated,
}: EditProviderUserDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [roleSlug, setRoleSlug] = useState(
    user?.userRoles[0]?.role.slug ?? roles[0]?.slug ?? "",
  );
  const [departmentId, setDepartmentId] = useState(
    user?.department?.id ?? "none",
  );
  const [pending, startTransition] = useTransition();

  const roleOptions = useMemo(
    () => roles.map((role) => ({ id: role.slug, label: role.name })),
    [roles],
  );

  const departmentOptions = useMemo(
    () => [
      { id: "none", label: "No department" },
      ...departments.map((department) => ({
        id: department.id,
        label: department.name,
      })),
    ],
    [departments],
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setError(null);
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "").trim();

    startTransition(async () => {
      const result = await updateProviderCustomerUserAction({
        tenantId,
        userId: user.id,
        name: String(formData.get("name") ?? ""),
        roleSlug,
        departmentId: departmentId === "none" ? null : departmentId,
        password: password || undefined,
      });

      if (!result.success) {
        setError(result.error);
        toast.error("Could not update user", { description: result.error });
        return;
      }

      toast.success("User updated");
      if (result.user) {
        onUpdated?.(result.user);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update name, role, department, or set a new password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-provider-user-name">Name</Label>
            <Input
              id="edit-provider-user-name"
              name="name"
              defaultValue={user?.name ?? ""}
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-provider-user-email">Email</Label>
            <Input
              id="edit-provider-user-email"
              value={user?.email ?? ""}
              disabled
              readOnly
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-provider-user-password">New password</Label>
            <PasswordInput
              id="edit-provider-user-password"
              name="password"
              minLength={8}
              placeholder="Leave blank to keep current password"
              disabled={pending}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SearchableSelect
              label="Role"
              id="edit-provider-user-role"
              options={roleOptions}
              value={roleSlug}
              onChange={setRoleSlug}
              placeholder="Select role"
              searchPlaceholder="Search roles…"
              disabled={pending}
            />
            <SearchableSelect
              label="Department"
              id="edit-provider-user-department"
              options={departmentOptions}
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="Select department"
              searchPlaceholder="Search departments…"
              disabled={pending}
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
            <Button type="submit" disabled={pending || !roleSlug}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
