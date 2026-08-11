"use client";

import { Plus, ShieldPlus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { createProviderCustomerUserAction } from "@/features/provider/actions/provider.actions";

interface RoleOption {
  slug: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

export type ProviderUserRow = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  userRoles: { role: { slug: string; name: string } }[];
  department: { id: string; name: string } | null;
};

interface CreateProviderUserDialogProps {
  tenantId: string;
  roles: RoleOption[];
  departments: DepartmentOption[];
  mode: "user" | "admin";
  disabled?: boolean;
  onCreated?: (user: ProviderUserRow) => void;
}

export function CreateProviderUserDialog({
  tenantId,
  roles,
  departments,
  mode,
  disabled = false,
  onCreated,
}: CreateProviderUserDialogProps) {
  const isAdmin = mode === "admin";
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleSlug, setRoleSlug] = useState(
    isAdmin ? "tenant_admin" : (roles[0]?.slug ?? ""),
  );
  const [departmentId, setDepartmentId] = useState("none");
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

  function resetForm() {
    setError(null);
    setDepartmentId("none");
    setRoleSlug(isAdmin ? "tenant_admin" : (roles[0]?.slug ?? ""));
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      resetForm();
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createProviderCustomerUserAction({
        tenantId,
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        roleSlug: isAdmin ? "tenant_admin" : roleSlug,
        departmentId: departmentId === "none" ? null : departmentId,
      });

      if (!result.success) {
        setError(result.error);
        toast.error("Could not create user", { description: result.error });
        return;
      }

      toast.success(isAdmin ? "Tenant Admin created" : "User created");
      if (result.user) {
        onCreated?.(result.user);
      }
      onOpenChange(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={isAdmin ? "outline" : "default"}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {isAdmin ? (
          <ShieldPlus className="size-4" />
        ) : (
          <Plus className="size-4" />
        )}
        {isAdmin ? "Add Tenant Admin" : "Add user"}
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isAdmin ? "Add Tenant Admin" : "Add user"}
            </DialogTitle>
            <DialogDescription>
              {isAdmin
                ? "Create a Tenant Admin who can manage this organization."
                : "Create a team member and assign their role."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`provider-user-name-${mode}`}>Name</Label>
              <Input
                id={`provider-user-name-${mode}`}
                name="name"
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`provider-user-email-${mode}`}>Email</Label>
              <Input
                id={`provider-user-email-${mode}`}
                name="email"
                type="email"
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`provider-user-password-${mode}`}>Password</Label>
              <PasswordInput
                id={`provider-user-password-${mode}`}
                name="password"
                required
                minLength={8}
                disabled={pending}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {isAdmin ? (
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value="Tenant Admin" disabled readOnly />
                </div>
              ) : (
                <SearchableSelect
                  label="Role"
                  id={`provider-user-role-${mode}`}
                  options={roleOptions}
                  value={roleSlug}
                  onChange={setRoleSlug}
                  placeholder="Select role"
                  searchPlaceholder="Search roles…"
                  disabled={pending}
                />
              )}
              <SearchableSelect
                label="Department"
                id={`provider-user-department-${mode}`}
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
              <Button
                type="submit"
                disabled={pending || (!isAdmin && !roleSlug)}
              >
                {pending ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
