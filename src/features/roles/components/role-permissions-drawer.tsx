"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { toggleRolePermissionAction } from "@/features/roles/actions/role.actions";
import { GroupedPermissionsChecklist } from "@/features/roles/components/grouped-permissions-checklist";
import { PermissionChangeDialog } from "@/features/roles/components/permission-change-dialog";
import {
  showPermissionChangeError,
  showPermissionChangeToast,
} from "@/features/roles/components/permission-change-toast";
import {
  usePermissionChangeDialog,
  type PermissionToggleRequest,
} from "@/features/roles/components/permission-toggle";
import type {
  GroupedPermissionItem,
  PermissionModuleGroup,
} from "@/features/roles/lib/group-permissions-by-module";
import type { RolePermissionRow } from "@/features/roles/types/role.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { matchesTableSearch } from "@/utils/match-table-search";

interface RolePermissionsDrawerProps {
  role: RolePermissionRow | null;
  groups: PermissionModuleGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isProtected: boolean;
}

type BulkPending = {
  roleId: string;
  roleName: string;
  moduleName: string;
  enable: boolean;
  items: GroupedPermissionItem[];
} | null;

export function RolePermissionsDrawer({
  role,
  groups,
  open,
  onOpenChange,
  isProtected,
}: RolePermissionsDrawerProps) {
  const router = useRouter();
  const roleId = role?.id ?? null;
  const [query, setQuery] = useState("");
  const [queryRoleId, setQueryRoleId] = useState(roleId);
  const [bulkPending, setBulkPending] = useState<BulkPending>(null);
  const [bulkBusy, startBulkTransition] = useTransition();

  // Reset search when switching roles (adjust during render — no effect needed).
  if (roleId !== queryRoleId) {
    setQueryRoleId(roleId);
    setQuery("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setQuery("");
    }
    onOpenChange(nextOpen);
  }

  const assignedSlugs = useMemo(
    () => new Set(role?.permissionSlugs ?? []),
    [role?.permissionSlugs],
  );

  const filteredGroups = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return groups;
    }

    return groups
      .map((group) => {
        const moduleMatch = matchesTableSearch(trimmed, [
          group.moduleName,
          group.description,
        ]);
        if (moduleMatch) {
          return group;
        }

        const permissions = group.permissions.filter((permission) =>
          matchesTableSearch(trimmed, [
            permission.label,
            permission.slug,
            permission.catalogName,
          ]),
        );
        if (permissions.length === 0) {
          return null;
        }
        return { ...group, permissions };
      })
      .filter((group): group is PermissionModuleGroup => group !== null);
  }, [groups, query]);

  const {
    pendingChange,
    isPending,
    openChangeDialog,
    closeChangeDialog,
    confirmChange,
  } = usePermissionChangeDialog(
    (change) => {
      showPermissionChangeToast({
        roleName: change.roleName,
        permissionName: change.permissionName,
        enabled: change.enabled,
      });
      router.refresh();
    },
    showPermissionChangeError,
    toggleRolePermissionAction,
  );

  function handleToggle(input: {
    permissionSlug: string;
    permissionName: string;
    enabled: boolean;
  }) {
    if (!role) return;
    openChangeDialog({
      roleId: role.id,
      roleName: role.name,
      permissionSlug: input.permissionSlug,
      permissionName: input.permissionName,
      enabled: input.enabled,
    });
  }

  function handleModuleSelectAll(group: PermissionModuleGroup, enable: boolean) {
    if (!role || isProtected) return;
    const items = group.permissions.filter((permission) => {
      const has = assignedSlugs.has(permission.slug);
      return enable ? !has : has;
    });
    if (items.length === 0) return;
    setBulkPending({
      roleId: role.id,
      roleName: role.name,
      moduleName: group.moduleName,
      enable,
      items,
    });
  }

  function closeBulkDialog() {
    if (bulkBusy) return;
    setBulkPending(null);
  }

  function confirmBulk() {
    if (!bulkPending) return;
    const change: BulkPending = bulkPending;

    startBulkTransition(async () => {
      let failed: string | null = null;
      for (const item of change.items) {
        const result = await toggleRolePermissionAction({
          roleId: change.roleId,
          permissionSlug: item.slug,
          enabled: change.enable,
        });
        if (result.error) {
          failed = result.error;
          break;
        }
      }

      if (failed) {
        showPermissionChangeError(failed);
        setBulkPending(null);
        router.refresh();
        return;
      }

      toast.success(
        change.enable ? "Access granted" : "Access cleared",
        {
          description: change.enable
            ? `All ${change.moduleName} access added to ${change.roleName}.`
            : `All ${change.moduleName} access removed from ${change.roleName}.`,
        },
      );
      setBulkPending(null);
      router.refresh();
    });
  }

  const dialogChange: PermissionToggleRequest | null = pendingChange;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>{role?.name ?? "Role access"}</SheetTitle>
            <SheetDescription>
              Choose what people with this role can see and do. Changes apply as
              soon as you confirm each toggle.
            </SheetDescription>
            {isProtected ? (
              <p className="rounded-md bg-muted/70 px-2.5 py-1.5 text-xs text-muted-foreground">
                This built-in role cannot be changed here.
              </p>
            ) : role?.isSystem ? (
              <p className="rounded-md bg-muted/70 px-2.5 py-1.5 text-xs text-muted-foreground">
                Built-in system role — you can adjust access. Renaming and
                deleting stay locked.
              </p>
            ) : null}
          </SheetHeader>

          <div className="border-b border-border/60 px-4 py-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search modules or permissions…"
                className="pl-8"
                aria-label="Search permissions"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {role ? (
              filteredGroups.length > 0 ? (
                <GroupedPermissionsChecklist
                  groups={filteredGroups}
                  assignedSlugs={assignedSlugs}
                  disabled={isProtected}
                  pending={isPending || bulkBusy}
                  mode="live"
                  onToggle={handleToggle}
                  onModuleSelectAll={
                    isProtected ? undefined : handleModuleSelectAll
                  }
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No permissions match “{query.trim()}”.
                </p>
              )
            ) : null}
          </div>

          <SheetFooter className="border-t border-border/60">
            <Button
              type="button"
              className="w-full"
              onClick={() => handleOpenChange(false)}
            >
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {dialogChange ? (
        <PermissionChangeDialog
          open
          onOpenChange={(next) => {
            if (!next) closeChangeDialog();
          }}
          roleName={dialogChange.roleName}
          permissionName={dialogChange.permissionName}
          enabled={dialogChange.enabled}
          pending={isPending}
          onConfirm={confirmChange}
        />
      ) : null}

      {bulkPending ? (
        <PermissionChangeDialog
          open
          onOpenChange={(next) => {
            if (!next) closeBulkDialog();
          }}
          roleName={bulkPending.roleName}
          permissionName={`all ${bulkPending.moduleName} access (${bulkPending.items.length})`}
          enabled={bulkPending.enable}
          pending={bulkBusy}
          onConfirm={confirmBulk}
        />
      ) : null}
    </>
  );
}
