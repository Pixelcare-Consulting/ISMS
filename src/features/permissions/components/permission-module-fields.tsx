"use client";

import {
  composePermissionSlug,
  formatPermissionName,
  getAppModuleById,
  type AppModule,
} from "@/config/app-modules";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PermissionModuleFieldsProps {
  modules: AppModule[];
  moduleId: string;
  action: string;
  slug: string;
  onModuleChange: (moduleId: string) => void;
  onActionChange: (action: string) => void;
  readOnly?: boolean;
  linkedModule?: AppModule | null;
  linkedAction?: string | null;
}

export function PermissionModuleFields({
  modules,
  moduleId,
  action,
  slug,
  onModuleChange,
  onActionChange,
  readOnly = false,
  linkedModule = null,
  linkedAction = null,
}: PermissionModuleFieldsProps) {
  const selectedModule = readOnly
    ? linkedModule
    : getAppModuleById(moduleId);
  const actions = selectedModule?.actions ?? [];

  function handleModuleChange(nextModuleId: string) {
    const appModule = getAppModuleById(nextModuleId);
    const nextAction = appModule?.actions[0]?.value ?? "";
    onModuleChange(nextModuleId);
    onActionChange(nextAction);
  }

  if (readOnly) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Module</Label>
          <Input
            value={
              linkedModule
                ? `${linkedModule.name}${linkedModule.route ? ` (${linkedModule.route})` : ""}`
                : "Not linked to a module"
            }
            disabled
            readOnly
          />
        </div>
        <div className="space-y-2">
          <Label>Action</Label>
          <Input
            value={
              linkedAction
                ? linkedModule?.actions.find((item) => item.value === linkedAction)
                    ?.label ?? linkedAction
                : "—"
            }
            disabled
            readOnly
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="permission-slug">Slug</Label>
          <Input id="permission-slug" value={slug} disabled readOnly />
        </div>
        {!linkedModule ? (
          <p className="text-xs text-muted-foreground">
            This slug does not match a registered module. Delete and recreate it
            using the module dropdown to link sidebar and route access.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="permission-module">Module</Label>
        <Select value={moduleId} onValueChange={handleModuleChange} required>
          <SelectTrigger id="permission-module" className="w-full">
            <SelectValue placeholder="Select a module" />
          </SelectTrigger>
          <SelectContent>
            {modules.map((appModule) => (
              <SelectItem key={appModule.id} value={appModule.id}>
                {appModule.name}
                {appModule.route ? ` · ${appModule.route}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedModule?.description ? (
          <p className="text-xs text-muted-foreground">
            {selectedModule.description}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="permission-action">Action</Label>
        <Select
          value={action}
          onValueChange={onActionChange}
          disabled={!moduleId}
          required
        >
          <SelectTrigger id="permission-action" className="w-full">
            <SelectValue placeholder="Select an action" />
          </SelectTrigger>
          <SelectContent>
            {actions.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="permission-slug">Slug</Label>
        <Input
          id="permission-slug"
          name="slug"
          value={slug}
          readOnly
          className="bg-muted/40"
        />
        <p className="text-xs text-muted-foreground">
          Generated as module.action. Assign it on Roles, then access is enforced
          via the linked module route.
        </p>
      </div>
    </div>
  );
}

export function buildPermissionDefaults(moduleId: string, action: string) {
  const appModule = getAppModuleById(moduleId);
  if (!appModule || !action) {
    return { slug: "", name: "" };
  }

  return {
    slug: composePermissionSlug(moduleId, action),
    name: formatPermissionName(appModule, action),
  };
}
