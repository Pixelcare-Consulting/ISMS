"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Grid3x3 } from "lucide-react";
import { toast } from "sonner";

import { deleteRoleAction } from "@/features/roles/actions/role.actions";
import { CreateRoleWizard } from "@/features/roles/components/create-role-wizard";
import { EditRoleDialog } from "@/features/roles/components/edit-role-dialog";
import { RoleCard } from "@/features/roles/components/role-card";
import { RolePermissionsDrawer } from "@/features/roles/components/role-permissions-drawer";
import { isProviderOnlyRole } from "@/features/roles/constants/role.constants";
import {
  countAssignedInGroups,
  groupPermissionsByModule,
} from "@/features/roles/lib/group-permissions-by-module";
import type { RolesPermissionsMatrix } from "@/features/roles/types/role.types";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { TableSearchToolbar, uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { buttonVariants } from "@/components/ui/button";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

interface RolesSimpleViewProps {
  matrix: RolesPermissionsMatrix;
  isPlatformOperator?: boolean;
}

export function RolesSimpleView({
  matrix,
  isPlatformOperator = false,
}: RolesSimpleViewProps) {
  const router = useRouter();
  const { roles, permissions } = matrix;
  const [query, setQuery] = useState("");
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<(typeof roles)[number] | null>(
    null,
  );
  const [deletingRole, setDeletingRole] = useState<(typeof roles)[number] | null>(
    null,
  );
  const [deletePending, startDeleteTransition] = useTransition();

  const groups = useMemo(
    () => groupPermissionsByModule(permissions),
    [permissions],
  );

  const filteredRoles = useMemo(
    () =>
      roles.filter((role) =>
        matchesTableSearch(query, [role.name, role.slug, role.description]),
      ),
    [query, roles],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        roles.map((role) => role.name),
        roles.map((role) => role.slug),
        roles.map((role) => role.description),
      ),
    [roles],
  );

  const activeRole =
    roles.find((role) => role.id === activeRoleId) ?? null;

  function isRoleProtected(role: (typeof roles)[number]) {
    return (
      isProviderOnlyRole(role.slug) ||
      (!isPlatformOperator && role.isSystem)
    );
  }

  function permissionSummary(role: (typeof roles)[number]) {
    const { assigned, total } = countAssignedInGroups(
      groups,
      role.permissionSlugs,
    );
    return `${assigned} of ${total} access area${total === 1 ? "" : "s"}`;
  }

  function handleDeleteConfirm() {
    if (!deletingRole) return;

    startDeleteTransition(async () => {
      const result = await deleteRoleAction(deletingRole.id);
      if (result.error) {
        toast.error("Could not delete role", { description: result.error });
        return;
      }

      toast.success("Role deleted");
      setDeletingRole(null);
      if (activeRoleId === deletingRole.id) {
        setActiveRoleId(null);
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-4">
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search roles by name or description…"
          suggestions={suggestions}
        >
          <Link
            href="/settings/roles/matrix"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5",
            )}
          >
            <Grid3x3 className="size-3.5" />
            Permission matrix
          </Link>
          <CreateRoleWizard groups={groups} permissions={permissions} />
        </TableSearchToolbar>

        {roles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              {isPlatformOperator
                ? "No roles configured yet."
                : "No custom roles yet. Use Add role to create one, or assign built-in roles from Settings → Users."}
            </p>
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="rounded-xl border border-border/60 px-6 py-12 text-center text-sm text-muted-foreground">
            No roles match your search.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRoles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                permissionSummary={permissionSummary(role)}
                isProtected={isRoleProtected(role)}
                onOpenPermissions={() => setActiveRoleId(role.id)}
                onEdit={() => setEditingRole(role)}
                onDelete={() => setDeletingRole(role)}
              />
            ))}
          </div>
        )}
      </div>

      <RolePermissionsDrawer
        role={activeRole}
        groups={groups}
        open={activeRoleId != null}
        onOpenChange={(open) => {
          if (!open) setActiveRoleId(null);
        }}
        isProtected={activeRole ? isRoleProtected(activeRole) : false}
      />

      {editingRole ? (
        <EditRoleDialog
          key={editingRole.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditingRole(null);
          }}
          role={editingRole}
        />
      ) : null}

      {deletingRole ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeletingRole(null);
          }}
          title="Delete role"
          description={`Delete ${deletingRole.name}? This action cannot be undone.`}
          pending={deletePending}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </>
  );
}
