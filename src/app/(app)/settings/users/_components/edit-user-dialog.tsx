"use client";

import { useMemo, useState, useTransition } from "react";

import { toast } from "sonner";

import { updateUserAction } from "@/features/users/actions/user.actions";
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

interface RoleOption {
  slug: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    name: string | null;
    email: string;
    userRoles: { role: { slug: string } }[];
    department: { id: string } | null;
  } | null;
  roles: RoleOption[];
  departments: DepartmentOption[];
  onUpdated?: (user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    userRoles: { role: { slug: string; name: string } }[];
    department: { id: string; name: string } | null;
  }) => void;
}

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  roles,
  departments,
  onUpdated,
}: EditUserDialogProps) {
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

  /**
   * Re-seed the fields each time the dialog opens on a user, so a previous edit never
   * shows up under someone else's name. Done during render rather than in an effect:
   * an effect fills the form a frame after it is on screen, which is visible as a flash
   * of the last user's values.
   */
  const editing = open && user ? user.id : null;
  const [seededFor, setSeededFor] = useState<string | null>(editing);
  if (editing !== seededFor) {
    setSeededFor(editing);
    if (editing && user) {
      setRoleSlug(user.userRoles[0]?.role.slug ?? roles[0]?.slug ?? "");
      setDepartmentId(user.department?.id ?? "none");
      setError(null);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("userId", user.id);
    formData.set("roleSlug", roleSlug);
    formData.set("departmentId", departmentId === "none" ? "" : departmentId);

    startTransition(async () => {
      const result = await updateUserAction(formData);
      if (result.error) {
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
            Update this user&apos;s details, role, or password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-user-name">Name</Label>
            <Input
              id="edit-user-name"
              name="name"
              defaultValue={user?.name ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-user-email">Email</Label>
            <Input
              id="edit-user-email"
              value={user?.email ?? ""}
              disabled
              readOnly
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-user-password">New password</Label>
            <PasswordInput
              id="edit-user-password"
              name="password"
              minLength={8}
              placeholder="Leave blank to keep current password"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SearchableSelect
              label="Role"
              id="edit-user-role"
              options={roleOptions}
              value={roleSlug}
              onChange={setRoleSlug}
              placeholder="Select role"
              searchPlaceholder="Search roles…"
              disabled={pending}
            />
            <SearchableSelect
              label="Department"
              id="edit-user-department"
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
