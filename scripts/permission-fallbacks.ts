/**
 * Fallback permissions removed on 2026-11-24.
 *
 * Before this change some buttons also passed on another module's checkbox, or on a hidden
 * legacy slug (`orders.*`, `sales.return.*`, `service_centers.return.*`) the role editor
 * does not show. Unticking the button's own checkbox then had no effect. Now each button
 * checks only its own checkbox.
 *
 * A role "loses" an action when it holds one of `fallbacks` but none of `needs`. Those roles
 * need the checkbox ticked in Settings → Roles if they should keep the action.
 * `scripts/report-permission-fallbacks.ts` lists them per database, read only.
 */

export interface RemovedFallback {
  /** What the person could do, as the client would describe it. */
  action: string;
  /** Any of these checkboxes still grants the action. */
  needs: readonly string[];
  /** Slugs that used to grant it and no longer do. */
  fallbacks: readonly string[];
}

const ORDER_TYPES = [
  { prefix: "orders.manual", label: "Manual orders" },
  { prefix: "orders.special", label: "Special orders" },
  { prefix: "orders.auto_replenish", label: "Auto replenish" },
] as const;

const ORDER_ACTIONS = [
  { action: "view", label: "View" },
  { action: "create", label: "Create" },
  { action: "approve", label: "Approve" },
] as const;

/** Approval-step checkboxes per type (the old per-type Approve is hidden). */
const ORDER_APPROVE_STEPS: Record<(typeof ORDER_TYPES)[number]["prefix"], readonly string[]> = {
  "orders.manual": ["orders.manual.approve_sp"],
  "orders.special": ["orders.special.approve_sp"],
  "orders.auto_replenish": ["orders.auto_replenish.approve_tl", "orders.auto_replenish.approve_sp"],
};

/**
 * The hidden Approve (old per-type or `orders.approve`) no longer approves (Part 2) and no
 * longer opens the pages or lifts the branch limit. Report what it still gave, not "approve".
 */
const ORDER_FALLBACKS: RemovedFallback[] = ORDER_TYPES.flatMap((type) => {
  const hiddenApprove = ["orders.approve", `${type.prefix}.approve`];
  const steps = ORDER_APPROVE_STEPS[type.prefix];
  return [
    ...ORDER_ACTIONS.filter(({ action }) => action !== "approve").map(({ action, label }) => ({
      action: `${type.label}: ${label}`,
      needs: [`${type.prefix}.${action}`],
      fallbacks: [`orders.${action}`],
    })),
    {
      action: `${type.label}: open the pages`,
      needs: [`${type.prefix}.view`, `${type.prefix}.create`, ...steps],
      fallbacks: hiddenApprove,
    },
    {
      action: `${type.label}: see every branch (now limited to the person's AOR)`,
      needs: ["branches.manage", ...steps],
      fallbacks: hiddenApprove,
    },
  ];
});

export const REMOVED_FALLBACKS: readonly RemovedFallback[] = [
  {
    action: "Open Deliveries",
    needs: ["logistics.view", "logistics.create", "logistics.manage", "logistics.delivery.receive"],
    fallbacks: ["orders.create", "orders.view"],
  },
  {
    action: "Open Transfers",
    needs: [
      "logistics.delivery_transfer.view",
      "logistics.view",
      "logistics.create",
      "logistics.manage",
      "logistics.delivery.receive",
      "logistics.delivery_transfer.create",
      "logistics.delivery_transfer.approve",
      "logistics.delivery_transfer.receive",
    ],
    fallbacks: ["orders.create", "orders.view"],
  },
  {
    action: "Deliveries: Receive",
    needs: ["logistics.delivery.receive"],
    fallbacks: ["logistics.create", "logistics.manage", "orders.create"],
  },
  {
    action: "Deliveries: Dispatch",
    needs: ["logistics.delivery.dispatch"],
    fallbacks: ["logistics.manage"],
  },
  {
    action: "Transfers: Create",
    needs: ["logistics.delivery_transfer.create"],
    fallbacks: ["logistics.create", "logistics.manage", "orders.create"],
  },
  {
    action: "Transfers: Approve / Reject",
    needs: ["logistics.delivery_transfer.approve"],
    fallbacks: ["logistics.manage", "orders.approve"],
  },
  {
    action: "Transfers: Receive",
    needs: ["logistics.delivery_transfer.receive"],
    fallbacks: [
      "logistics.create",
      "logistics.manage",
      "orders.create",
      "orders.approve",
      "logistics.delivery_transfer.approve",
    ],
  },
  {
    action: "Pull-outs: Create",
    needs: ["pullouts.create"],
    fallbacks: ["logistics.create", "logistics.manage", "orders.create"],
  },
  {
    action: "Pull-outs: Approve / Reject",
    needs: ["pullouts.approve"],
    fallbacks: ["logistics.manage", "orders.approve"],
  },
  {
    action: "Pull-outs: Manage (edit list, Send, Check SAP)",
    needs: ["pullouts.manage"],
    fallbacks: ["logistics.manage"],
  },
  {
    action: "Service center pull-outs: Create",
    needs: ["service_centers.logistics.create"],
    fallbacks: ["service_centers.logistics.manage"],
  },
  {
    action: "Service center pull-outs: Approve / Reject",
    needs: ["service_centers.logistics.approve"],
    fallbacks: ["service_centers.orders.approve", "service_centers.logistics.manage"],
  },
  ...ORDER_FALLBACKS,
  {
    action: "Open Service center orders",
    needs: [
      "service_centers.orders.view",
      "service_centers.orders.create",
      "service_centers.orders.approve_sp",
    ],
    fallbacks: ["service_centers.orders.approve"],
  },
  {
    action: "Open Returns",
    needs: [
      "returns.view",
      "returns.branch.view",
      "returns.service.view",
      "returns.request",
      "returns.evaluate",
      "returns.approve",
      "returns.complete",
    ],
    fallbacks: [
      "sales.return.view",
      "sales.return.request",
      "sales.return.evaluate",
      "sales.return.approve",
      "sales.return.complete",
      "service_centers.return.request",
      "service_centers.return.evaluate",
      "service_centers.return.approve",
      "service_centers.return.complete",
    ],
  },
  {
    action: "Returns: Request",
    needs: ["returns.request"],
    fallbacks: [
      "sales.return.request",
      "sales.create",
      "service_centers.return.request",
      "service_centers.sales.create",
    ],
  },
  {
    action: "Returns: Evaluate / Reject at CS",
    needs: ["returns.evaluate"],
    fallbacks: [
      "sales.return.evaluate",
      "sales.create",
      "service_centers.return.evaluate",
      "service_centers.sales.create",
    ],
  },
  {
    action: "Returns: Approve / Reject at TL",
    needs: ["returns.approve"],
    fallbacks: [
      "sales.return.approve",
      "orders.approve",
      "service_centers.return.approve",
      "service_centers.orders.approve",
    ],
  },
  {
    action: "Returns: Complete (restore stock, finish replacement)",
    needs: ["returns.complete"],
    fallbacks: [
      "sales.return.complete",
      "logistics.manage",
      "sales.create",
      "service_centers.return.complete",
      "service_centers.logistics.manage",
      "service_centers.sales.create",
    ],
  },
];

export interface LostAction {
  action: string;
  needs: readonly string[];
  /** The fallback slugs this role holds that used to grant the action. */
  via: string[];
}

/** Actions a role held only through a removed fallback. */
export function lostActions(granted: Iterable<string>): LostAction[] {
  const slugs = new Set(granted);
  const lost: LostAction[] = [];
  for (const rule of REMOVED_FALLBACKS) {
    if (rule.needs.some((slug) => slugs.has(slug))) continue;
    const via = rule.fallbacks.filter((slug) => slugs.has(slug));
    if (via.length > 0) lost.push({ action: rule.action, needs: rule.needs, via });
  }
  return lost;
}
