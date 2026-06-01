"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  roles,
  departments,
}: EditUserDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [roleSlug, setRoleSlug] = useState(
    user?.userRoles[0]?.role.slug ?? roles[0]?.slug ?? "",
  );
  const [departmentId, setDepartmentId] = useState(
    user?.department?.id ?? "none",
  );
  const [pending, startTransition] = useTransition();

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
      onOpenChange(false);
      router.refresh();
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
            <Input
              id="edit-user-password"
              name="password"
              type="password"
              minLength={8}
              placeholder="Leave blank to keep current password"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-user-role">Role</Label>
              <Select value={roleSlug} onValueChange={setRoleSlug} required>
                <SelectTrigger id="edit-user-role" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.slug} value={role.slug}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-user-department">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="edit-user-department" className="w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
