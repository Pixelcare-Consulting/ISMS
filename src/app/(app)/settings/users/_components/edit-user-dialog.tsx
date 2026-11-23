"use client";

import { useMemo, useState, useTransition } from "react";

import { toast } from "sonner";

import { updateUserAction } from "@/features/users/actions/user.actions";
import { UPDATE_USER_PASSWORD_MIN } from "@/features/users/schemas/update-user.schema";
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
import {
  UserRolePicker,
  type UserRoleOption,
} from "@/app/(app)/settings/users/_components/user-role-picker";

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
  roles: UserRoleOption[];
  departments: DepartmentOption[];
  hideSystemRoles: boolean;
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
  hideSystemRoles,
  onUpdated,
}: EditUserDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(
    user?.userRoles.map((userRole) => userRole.role.slug) ?? [],
  );
  const [departmentId, setDepartmentId] = useState(
    user?.department?.id ?? "none",
  );
  const [pending, startTransition] = useTransition();

  const assignedSlugs = useMemo(
    () => user?.userRoles.map((userRole) => userRole.role.slug) ?? [],
    [user],
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
      setSelectedSlugs(user.userRoles.map((userRole) => userRole.role.slug));
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
    if (selectedSlugs.length === 0) {
      setError("At least one role is required");
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("userId", user.id);
    for (const slug of selectedSlugs) {
      formData.append("roleSlugs", slug);
    }
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
      <DialogContent className="flex max-h-[calc(100svh-2rem)] max-w-[1050px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1050px] sm:p-0">
        <DialogHeader className="shrink-0 space-y-1.5 border-b px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update this user&apos;s details, role, or password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-user-name">Name</Label>
              <Input
                id="edit-user-name"
                name="name"
                defaultValue={user?.name ?? ""}
                required
                disabled={pending}
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
                minLength={UPDATE_USER_PASSWORD_MIN}
                disabled={pending}
                placeholder="Leave blank to keep current password"
                autoComplete="new-password"
              />
            </div>
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

          <UserRolePicker
            roles={roles}
            selectedSlugs={selectedSlugs}
            onSelectedSlugsChange={setSelectedSlugs}
            hideSystemRoles={hideSystemRoles}
            assignedSlugs={assignedSlugs}
            disabled={pending}
            idPrefix="edit-user"
          />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || selectedSlugs.length === 0}
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
