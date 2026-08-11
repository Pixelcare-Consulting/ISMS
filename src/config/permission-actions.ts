/**
 * Shared permission-action vocabulary for Hybrid RBAC.
 * Modules allowlist which of these actions apply; Roles UI and Create-permission
 * dialogs read labels from here so action names stay consistent.
 */

export interface PermissionActionDef {
  value: string;
  label: string;
  description?: string;
}

/** Ordered vocabulary — standard CRUD-ish first, then domain extras. */
export const PERMISSION_ACTION_ORDER = [
  "view",
  "branch.view",
  "service.view",
  "create",
  "update",
  "delete",
  "manage",
  "approve",
  "export",
  "close",
  "request",
  "evaluate",
  "complete",
  "return.view",
  "return.request",
  "return.evaluate",
  "return.approve",
  "return.complete",
] as const;

export type PermissionActionValue = (typeof PERMISSION_ACTION_ORDER)[number];

export const PERMISSION_ACTIONS: Record<
  PermissionActionValue,
  PermissionActionDef
> = {
  view: {
    value: "view",
    label: "View",
    description: "Read / list access",
  },
  "branch.view": {
    value: "branch.view",
    label: "Branch",
    description: "View the Branch Returns tab",
  },
  "service.view": {
    value: "service.view",
    label: "Service",
    description: "View the Service Returns tab",
  },
  create: {
    value: "create",
    label: "Create",
    description: "Create records or start workflows",
  },
  update: {
    value: "update",
    label: "Update",
    description: "Edit existing records",
  },
  delete: {
    value: "delete",
    label: "Delete",
    description: "Delete or soft-delete records",
  },
  manage: {
    value: "manage",
    label: "Manage",
    description: "Full module administration",
  },
  approve: {
    value: "approve",
    label: "Approve",
    description: "Approve or reject pending items",
  },
  export: {
    value: "export",
    label: "Export",
    description: "Export / download reports",
  },
  close: {
    value: "close",
    label: "Close",
    description: "Close an audit or workflow",
  },
  request: {
    value: "request",
    label: "Request",
    description: "Start a return request",
  },
  evaluate: {
    value: "evaluate",
    label: "Evaluate",
    description: "CS evaluation step for a return",
  },
  complete: {
    value: "complete",
    label: "Complete",
    description: "Complete a return and restore stock",
  },
  "return.view": {
    value: "return.view",
    label: "View returns",
    description: "Legacy: view branch return ledger (alias for Returns / Replacement)",
  },
  "return.request": {
    value: "return.request",
    label: "Request return",
    description: "Legacy: open a sales / service-center return request",
  },
  "return.evaluate": {
    value: "return.evaluate",
    label: "Evaluate return (CS)",
    description: "Legacy: CS evaluation step for a return",
  },
  "return.approve": {
    value: "return.approve",
    label: "Approve return (TL)",
    description: "Legacy: TL approval step for a return",
  },
  "return.complete": {
    value: "return.complete",
    label: "Complete return / restore",
    description: "Legacy: complete return and restore stock",
  },
};

export interface PermissionActionOption {
  value: string;
  label: string;
}

/** Build module allowlist options from vocabulary values (stable order). */
export function permissionActions(
  ...values: PermissionActionValue[]
): PermissionActionOption[] {
  const orderIndex = new Map(
    PERMISSION_ACTION_ORDER.map((value, index) => [value, index]),
  );
  return [...values]
    .sort(
      (a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999),
    )
    .map((value) => ({
      value: PERMISSION_ACTIONS[value].value,
      label: PERMISSION_ACTIONS[value].label,
    }));
}

export function getPermissionActionLabel(action: string): string {
  const known = PERMISSION_ACTIONS[action as PermissionActionValue];
  if (known) {
    return known.label;
  }
  return action.charAt(0).toUpperCase() + action.slice(1);
}

export function isKnownPermissionAction(
  action: string,
): action is PermissionActionValue {
  return Object.prototype.hasOwnProperty.call(PERMISSION_ACTIONS, action);
}

/** Column order for the Roles module×action matrix. */
export function matrixActionColumns(
  presentActions: Iterable<string>,
): PermissionActionOption[] {
  const present = new Set(presentActions);
  return PERMISSION_ACTION_ORDER.filter((value) => present.has(value)).map(
    (value) => ({
      value: PERMISSION_ACTIONS[value].value,
      label: PERMISSION_ACTIONS[value].label,
    }),
  );
}
