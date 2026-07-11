"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
  composePermissionSlug,
  formatPermissionName,
  getAppModuleById,
  type AppModule,
} from "@/config/app-modules";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils/cn";

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

function formatModuleLabel(appModule: AppModule) {
  return appModule.route
    ? `${appModule.name} · ${appModule.route}`
    : appModule.name;
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
  const [moduleOpen, setModuleOpen] = useState(false);
  const [moduleQuery, setModuleQuery] = useState("");

  const selectedModule = readOnly
    ? linkedModule
    : getAppModuleById(moduleId);
  const actions = selectedModule?.actions ?? [];

  const filteredModules = useMemo(() => {
    const q = moduleQuery.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter((appModule) => {
      const haystack = [
        appModule.name,
        appModule.route ?? "",
        appModule.slugPrefix,
        appModule.id,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [modules, moduleQuery]);

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
        <Popover
          open={moduleOpen}
          onOpenChange={(next) => {
            setModuleOpen(next);
            if (!next) setModuleQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id="permission-module"
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={moduleOpen}
              className={cn(
                "h-9 w-full justify-between border-input bg-background font-normal shadow-sm",
                "hover:border-primary/40 hover:bg-background hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "truncate text-left",
                  !selectedModule && "text-muted-foreground",
                )}
              >
                {selectedModule
                  ? formatModuleLabel(selectedModule)
                  : "Select a module"}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search by name or route…"
                value={moduleQuery}
                onValueChange={setModuleQuery}
              />
              <CommandList>
                <CommandEmpty>No modules found.</CommandEmpty>
                <CommandGroup>
                  {filteredModules.map((appModule) => {
                    const isSelected = appModule.id === moduleId;
                    return (
                      <CommandItem
                        key={appModule.id}
                        value={appModule.id}
                        onSelect={() => {
                          handleModuleChange(appModule.id);
                          setModuleOpen(false);
                          setModuleQuery("");
                        }}
                      >
                        <Check
                          className={cn(
                            "size-4 shrink-0",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {formatModuleLabel(appModule)}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
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
