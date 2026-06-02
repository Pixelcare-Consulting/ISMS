"use client";
import { useEffect, useState, useTransition } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createUserAction } from "@/features/users/actions/user.actions";
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

interface CreateUserDialogProps {
  roles: RoleOption[];
  departments: DepartmentOption[];
  onCreated?: (user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    userRoles: { role: { slug: string; name: string } }[];
    department: { id: string; name: string } | null;
  }) => void;
}

export function CreateUserDialog({
  roles,
  departments,
  onCreated,
}: CreateUserDialogProps) {
  const { isUserDialogOpen, setUserDialogOpen } = useSettingsUi();
  const [error, setError] = useState<string | null>(null);
  const [roleSlug, setRoleSlug] = useState(roles[0]?.slug ?? "");
  const [departmentId, setDepartmentId] = useState<string>("none");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => setUserDialogOpen(false);
  }, [setUserDialogOpen]);

  function resetForm() {
    setError(null);
    setDepartmentId("none");
    setRoleSlug(roles[0]?.slug ?? "");
  }

  function onOpenChange(open: boolean) {
    setUserDialogOpen(open);
    if (!open) {
      resetForm();
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("roleSlug", roleSlug);
    if (departmentId !== "none") {
      formData.set("departmentId", departmentId);
    }

    startTransition(async () => {
      const result = await createUserAction(formData);
      if (result.error) {
        setError(result.error);
        toast.error("Could not create user", { description: result.error });
        return;
      }
      toast.success("User created", {
        description: "The new team member can sign in now.",
      });
      if (result.user) {
        onCreated?.(result.user);
      }
      onOpenChange(false);
    });
  }

  return (
    <>
      <Button onClick={() => setUserDialogOpen(true)}>
        <Plus className="size-4" />
        Add user
      </Button>

      <Dialog open={isUserDialogOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Create a new team member and assign their role.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="roleSlug">Role</Label>
                <Select value={roleSlug} onValueChange={setRoleSlug} required>
                  <SelectTrigger id="roleSlug" className="w-full">
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
                <Label htmlFor="departmentId">Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger id="departmentId" className="w-full">
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
                {pending ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
