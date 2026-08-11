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
  "create",
  "update",
  "delete",
  "manage",
  "approve",
  "export",
  "close",
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
  "return.view": {
    value: "return.view",
    label: "View returns",
    description: "View the Sales Returns tab / ATR ledger",
  },
  "return.request": {
    value: "return.request",
    label: "Request return",
    description: "Open a sales ATR / return request",
  },
  "return.evaluate": {
    value: "return.evaluate",
    label: "Evaluate return (CS)",
    description: "CS evaluation step for ATR",
  },
  "return.approve": {
    value: "return.approve",
    label: "Approve return (TL)",
    description: "TL approval step for ATR",
  },
  "return.complete": {
    value: "return.complete",
    label: "Complete return / restore",
    description: "Complete ATR and restore stock",
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
