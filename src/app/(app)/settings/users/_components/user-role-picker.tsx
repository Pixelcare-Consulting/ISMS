"use client";

import { useMemo, useState, type ReactNode } from "react";

import { ChevronDown } from "lucide-react";

import { AccessPreviewPanel } from "@/features/roles/components/access-preview-panel";

import {
  categoryOptions,
  combinedPermissionNames,
  filterPickerRoles,
  pickerRolesForAssignment,
  type PickerRole,
} from "@/features/users/lib/user-role-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

export interface UserRoleOption extends PickerRole {
  description: string | null;
  isSystem: boolean;
}

interface UserRolePickerProps {
  roles: UserRoleOption[];
  selectedSlugs: string[];
  onSelectedSlugsChange: (
    slugs: string[] | ((current: string[]) => string[]),
  ) => void;
  /** When on, built-in roles are hidden except ones already assigned. */
  hideSystemRoles: boolean;
  /** Roles saved on this user before the dialog opened. */
  assignedSlugs: string[];
  disabled?: boolean;
  idPrefix: string;
}

export function UserRolePicker({
  roles,
  selectedSlugs,
  onSelectedSlugsChange,
  hideSystemRoles,
  assignedSlugs,
  disabled = false,
  idPrefix,
}: UserRolePickerProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "selected">("all");
  const [category, setCategory] = useState("all");

  const offeredRoles = useMemo(
    () =>
      pickerRolesForAssignment(roles, {
        hideSystemRoles,
        assignedSlugs,
      }),
    [assignedSlugs, hideSystemRoles, roles],
  );

  const categories = useMemo(
    () => categoryOptions(offeredRoles),
    [offeredRoles],
  );

  const activeCategory = categories.includes(category) ? category : "all";

  const allMatches = useMemo(
    () =>
      filterPickerRoles(offeredRoles, {
        query,
        category: activeCategory,
        tab: "all",
        selectedSlugs,
      }),
    [activeCategory, offeredRoles, query, selectedSlugs],
  );

  const selectedMatches = useMemo(
    () =>
      filterPickerRoles(offeredRoles, {
        query,
        category: activeCategory,
        tab: "selected",
        selectedSlugs,
      }),
    [activeCategory, offeredRoles, query, selectedSlugs],
  );

  const visibleRoles = tab === "selected" ? selectedMatches : allMatches;

  const selectedRoles = useMemo(() => {
    const bySlug = new Map(roles.map((role) => [role.slug, role]));
    return selectedSlugs
      .map((slug) => bySlug.get(slug))
      .filter((role): role is UserRoleOption => role != null);
  }, [roles, selectedSlugs]);

  const permissionNames = useMemo(
    () => combinedPermissionNames(roles, selectedSlugs),
    [roles, selectedSlugs],
  );

  function setRoleChecked(slug: string, checked: boolean) {
    if (disabled) {
      return;
    }
    onSelectedSlugsChange((current) => {
      if (checked) {
        return current.includes(slug) ? current : [...current, slug];
      }
      return current.filter((item) => item !== slug);
    });
  }

  const assignedHeading =
    selectedRoles.length === 1
      ? "1 role assigned"
      : `${selectedRoles.length} roles assigned`;

  return (
    <div className="grid items-stretch gap-4 min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <section className="min-w-0 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-foreground">
            Roles <span className="text-destructive">*</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {selectedSlugs.length} selected
          </p>
        </div>
        <Input
          id={`${idPrefix}-role-search`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by role name or description"
          disabled={disabled}
          aria-label="Search roles"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Role list"
            className="inline-flex rounded-lg bg-muted p-3px"
          >
            <TabButton
              selected={tab === "all"}
              onClick={() => setTab("all")}
              disabled={disabled}
            >
              All roles ({allMatches.length})
            </TabButton>
            <TabButton
              selected={tab === "selected"}
              onClick={() => setTab("selected")}
              disabled={disabled}
            >
              Selected ({selectedMatches.length})
            </TabButton>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                className="ml-auto"
              >
                {activeCategory === "all" ? "Category" : activeCategory}
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuItem onSelect={() => setCategory("all")}>
                All
              </DropdownMenuItem>
              {categories.map((item) => (
                <DropdownMenuItem key={item} onSelect={() => setCategory(item)}>
                  {item}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/80 p-1">
          {visibleRoles.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              {offeredRoles.length === 0
                ? "No roles to assign."
                : "No roles match your search."}
            </li>
          ) : (
            visibleRoles.map((role) => {
              const checked = selectedSlugs.includes(role.slug);
              const inputId = `${idPrefix}-role-${role.slug}`;
              return (
                <li key={role.slug}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md px-3 py-2",
                      checked ? "bg-[#E8F5F1]" : "hover:bg-muted/60",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(value) =>
                        setRoleChecked(role.slug, value === true)
                      }
                      className="mt-0.5"
                      aria-label={role.name}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {role.name}
                      </span>
                      {role.description ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {role.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <AccessPreviewPanel
        heading={assignedHeading}
        selectedLabel="Selected roles"
        selectedItems={selectedRoles.map((role) => ({
          id: role.slug,
          name: role.name,
        }))}
        onRemove={(slug) => setRoleChecked(slug, false)}
        accessNames={permissionNames}
        emptySelection="Select at least one role."
        emptyAccess={
          selectedRoles.length === 0
            ? "Combined access appears here."
            : "These roles do not list any permissions."
        }
        note="Permissions add up. Assign only the roles this user needs."
        caption="From the selected roles"
        disabled={disabled}
      />
    </div>
  );
}

function TabButton({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium",
        selected
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
