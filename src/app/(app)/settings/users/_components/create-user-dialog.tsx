"use client";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { TENANT_CREATE_USER_PASSWORD_MIN } from "@/features/users/schemas/create-user.schema";
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

interface CreateUserDialogProps {
  roles: UserRoleOption[];
  departments: DepartmentOption[];
  hideSystemRoles: boolean;
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
  hideSystemRoles,
  onCreated,
}: CreateUserDialogProps) {
  const { isUserDialogOpen, setUserDialogOpen } = useSettingsUi();
  const [error, setError] = useState<string | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState<string>("none");
  const [pending, startTransition] = useTransition();

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

  useEffect(() => {
    return () => setUserDialogOpen(false);
  }, [setUserDialogOpen]);

  function resetForm() {
    setError(null);
    setDepartmentId("none");
    setSelectedSlugs([]);
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
    const password = String(formData.get("password") ?? "");
    if (password.length < TENANT_CREATE_USER_PASSWORD_MIN) {
      setError(
        `Password must be at least ${TENANT_CREATE_USER_PASSWORD_MIN} characters`,
      );
      return;
    }
    if (selectedSlugs.length === 0) {
      setError("At least one role is required");
      return;
    }

    for (const slug of selectedSlugs) {
      formData.append("roleSlugs", slug);
    }
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
        <DialogContent className="max-w-[1050px]">
          <DialogHeader>
            <DialogTitle>Create new user</DialogTitle>
            <DialogDescription className="text-xs font-normal text-muted-foreground">
              Create a new user to access ISMS.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required disabled={pending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  disabled={pending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  required
                  minLength={TENANT_CREATE_USER_PASSWORD_MIN}
                  disabled={pending}
                  autoComplete="new-password"
                />
              </div>
              <SearchableSelect
                label="Department"
                id="departmentId"
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
              assignedSlugs={[]}
              disabled={pending}
              idPrefix="create-user"
            />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter className="gap-2">
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
                {pending ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
