"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createRoleAction,
  toggleRolePermissionAction,
} from "@/features/roles/actions/role.actions";
import { GroupedPermissionsChecklist } from "@/features/roles/components/grouped-permissions-checklist";
import { slugifyRoleName } from "@/features/roles/constants/role.constants";
import type { PermissionModuleGroup } from "@/features/roles/lib/group-permissions-by-module";
import {
  ROLE_TEMPLATES,
  getRoleTemplateById,
  resolveTemplateSlugs,
} from "@/features/roles/lib/role-templates";
import type { PermissionRow } from "@/features/roles/types/role.types";
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
import { cn } from "@/utils/cn";

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Name",
  2: "Template",
  3: "Access",
  4: "Review",
};

interface CreateRoleWizardProps {
  groups: PermissionModuleGroup[];
  permissions: PermissionRow[];
}

export function CreateRoleWizard({
  groups,
  permissions,
}: CreateRoleWizardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [showAdvancedSlug, setShowAdvancedSlug] = useState(false);
  const [templateId, setTemplateId] = useState("blank");
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const catalogSlugs = useMemo(
    () => new Set(permissions.map((permission) => permission.slug)),
    [permissions],
  );

  const selectedList = useMemo(
    () => Array.from(selectedSlugs).sort(),
    [selectedSlugs],
  );

  const permissionLabelBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const permission of group.permissions) {
        map.set(permission.slug, permission.label);
      }
    }
    return map;
  }, [groups]);

  function resetForm() {
    setError(null);
    setStep(1);
    setName("");
    setDescription("");
    setSlug("");
    setSlugTouched(false);
    setShowAdvancedSlug(false);
    setTemplateId("blank");
    setSelectedSlugs(new Set());
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      resetForm();
    }
  }

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugifyRoleName(value));
    }
  }

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const template = getRoleTemplateById(nextTemplateId);
    if (!template) return;
    setSelectedSlugs(new Set(resolveTemplateSlugs(template, catalogSlugs)));
  }

  function canGoNext(): boolean {
    if (step === 1) {
      return name.trim().length > 0;
    }
    return true;
  }

  function goNext() {
    setError(null);
    if (!canGoNext()) {
      setError("Enter a role name to continue.");
      return;
    }
    setStep((current) => Math.min(4, current + 1) as WizardStep);
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(1, current - 1) as WizardStep);
  }

  function onToggleSlug(slugValue: string, enabled: boolean) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(slugValue);
      } else {
        next.delete(slugValue);
      }
      return next;
    });
  }

  function onModuleSelectAll(
    group: PermissionModuleGroup,
    enable: boolean,
  ) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      for (const permission of group.permissions) {
        if (enable) {
          next.add(permission.slug);
        } else {
          next.delete(permission.slug);
        }
      }
      return next;
    });
  }

  function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      setStep(1);
      return;
    }

    const formData = new FormData();
    formData.set("name", name.trim());
    if (description.trim()) {
      formData.set("description", description.trim());
    }
    if (slug.trim()) {
      formData.set("slug", slug.trim());
    }

    const slugsToGrant = Array.from(selectedSlugs);

    startTransition(async () => {
      const result = await createRoleAction(formData);
      if (result.error || !result.roleId) {
        setError(result.error ?? "Could not create role");
        toast.error("Could not create role", {
          description: result.error ?? "Missing role id after create",
        });
        return;
      }

      let grantFailed: string | null = null;
      for (const permissionSlug of slugsToGrant) {
        const toggleResult = await toggleRolePermissionAction({
          roleId: result.roleId,
          permissionSlug,
          enabled: true,
        });
        if (toggleResult.error) {
          grantFailed = toggleResult.error;
          break;
        }
      }

      if (grantFailed) {
        toast.error("Role created, but some access was not applied", {
          description: grantFailed,
        });
      } else {
        toast.success("Role created", {
          description:
            slugsToGrant.length > 0
              ? `${name.trim()} was added with ${slugsToGrant.length} access area${slugsToGrant.length === 1 ? "" : "s"}.`
              : `${name.trim()} was added. You can set access from the role card.`,
        });
      }

      onOpenChange(false);
      router.refresh();
    });
  }

  const template = getRoleTemplateById(templateId);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add role
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-3 border-b border-border/60 px-6 py-4 text-left">
            <DialogTitle>Add role</DialogTitle>
            <DialogDescription>
              Create a custom role with a plain-language access checklist.
            </DialogDescription>
            <ol className="flex flex-wrap gap-1.5">
              {([1, 2, 3, 4] as const).map((item) => (
                <li
                  key={item}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium",
                    item === step
                      ? "bg-primary text-primary-foreground"
                      : item < step
                        ? "bg-muted text-foreground"
                        : "bg-muted/50 text-muted-foreground",
                  )}
                >
                  {item}. {STEP_LABELS[item]}
                </li>
              ))}
            </ol>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {step === 1 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wizard-role-name">Name</Label>
                  <Input
                    id="wizard-role-name"
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                    placeholder="Compliance reviewer"
                    required
                    maxLength={60}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wizard-role-description">
                    Description{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="wizard-role-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What this role is for"
                    maxLength={200}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setShowAdvancedSlug((prev) => !prev)}
                  >
                    {showAdvancedSlug ? "Hide advanced" : "Advanced: edit slug"}
                  </button>
                  {showAdvancedSlug ? (
                    <div className="mt-2 space-y-2">
                      <Label htmlFor="wizard-role-slug">Slug</Label>
                      <Input
                        id="wizard-role-slug"
                        value={slug}
                        onChange={(event) => {
                          setSlugTouched(true);
                          setSlug(event.target.value);
                        }}
                        placeholder="compliance_reviewer"
                        maxLength={48}
                      />
                      <p className="text-xs text-muted-foreground">
                        Used internally. Auto-generated from the name if left
                        blank.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Pick a starter, or keep blank and choose access next.
                </p>
                <ul className="space-y-2">
                  {ROLE_TEMPLATES.map((item) => {
                    const selected = templateId === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => applyTemplate(item.id)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-border/70 hover:bg-accent/30",
                          )}
                        >
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  What should people with this role be able to see and do?
                </p>
                <GroupedPermissionsChecklist
                  groups={groups}
                  assignedSlugs={selectedSlugs}
                  mode="draft"
                  onToggleSlug={onToggleSlug}
                  onModuleSelectAll={onModuleSelectAll}
                />
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
                  <p className="font-medium text-foreground">{name.trim()}</p>
                  {description.trim() ? (
                    <p className="mt-1 text-muted-foreground">
                      {description.trim()}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Template: {template?.name ?? "Blank"}
                  </p>
                </div>
                <div>
                  <p className="mb-2 font-medium text-foreground">
                    Access ({selectedList.length})
                  </p>
                  {selectedList.length === 0 ? (
                    <p className="text-muted-foreground">
                      No access selected — you can add it after creating the
                      role.
                    </p>
                  ) : (
                    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/60 px-3 py-2">
                      {selectedList.map((slugValue) => (
                        <li
                          key={slugValue}
                          className="text-xs text-muted-foreground"
                        >
                          {permissionLabelBySlug.get(slugValue) ?? slugValue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border/60 px-6 py-4 sm:justify-between">
            <div className="flex gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={pending}
                >
                  Back
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step < 4 ? (
                <Button
                  type="button"
                  onClick={goNext}
                  disabled={pending || !canGoNext()}
                >
                  Continue
                </Button>
              ) : (
                <Button type="button" onClick={onSubmit} disabled={pending}>
                  {pending ? "Creating…" : "Create role"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
