/**
 * Client-facing ISMS workflow charts for Help & Support.
 * End-user language only — no RBAC slugs or enum codes as primary labels.
 */

export type WorkflowChartKind = "overview" | "swimlane" | "matrix";

export interface WorkflowChartNode {
  id: string;
  label: string;
  /** Optional short note under the node label */
  hint?: string;
}

export interface WorkflowChartEdge {
  from: string;
  to: string;
  label?: string;
}

export interface WorkflowLane {
  id: string;
  role: string;
  nodeIds: string[];
}

export interface WorkflowChart {
  id: string;
  title: string;
  /** Short label for process picker chips (falls back to title) */
  tabLabel?: string;
  summary: string;
  kind: WorkflowChartKind;
  /** Ordered nodes for overview (left-to-right) or swimlane node pool */
  nodes: WorkflowChartNode[];
  edges: WorkflowChartEdge[];
  /** Present when kind is swimlane */
  lanes?: WorkflowLane[];
  /** Plain-language callouts (stock status, exceptions) */
  callouts?: string[];
}

/** Master left-to-right ops story shown first on Help. */
export const WORKFLOW_MASTER_OVERVIEW: WorkflowChart = {
  id: "master-overview",
  title: "End-to-end path",
  summary:
    "Setup and planning through orders, stock, sales, returns, reporting, and policies.",
  kind: "overview",
  nodes: [
    { id: "setup", label: "Setup", hint: "Company, users, branches" },
    { id: "plan", label: "Plan", hint: "Forecast & suggestions" },
    { id: "order", label: "Order & approve", hint: "Manual · Auto · Special" },
    { id: "deliver", label: "Deliver & accept", hint: "Logistics → branch" },
    { id: "stock", label: "On-hand stock", hint: "Serialized units" },
    { id: "sell", label: "Sell", hint: "Branch sales" },
    { id: "return", label: "Returns / Replacement", hint: "Approve & restore stock" },
    { id: "move", label: "Transfer / pull-out", hint: "Move or retrieve" },
    { id: "count", label: "P-Count", hint: "Physical count" },
    { id: "report", label: "Reports & audit", hint: "Read-only views" },
    { id: "policies", label: "Policies", hint: "ISO documents" },
  ],
  edges: [
    { from: "setup", to: "plan" },
    { from: "plan", to: "order" },
    { from: "order", to: "deliver" },
    { from: "deliver", to: "stock" },
    { from: "stock", to: "sell" },
    { from: "sell", to: "return" },
    { from: "stock", to: "move" },
    { from: "stock", to: "count" },
    { from: "sell", to: "report" },
    { from: "setup", to: "policies" },
  ],
};

export const WORKFLOW_SWIMLANE_CHARTS: WorkflowChart[] = [
  {
    id: "setup",
    title: "Setup",
    tabLabel: "Setup",
    summary:
      "Tenant admins prepare the company so day-to-day ops have the right people, places, and catalog.",
    kind: "swimlane",
    lanes: [
      {
        id: "admin",
        role: "Tenant admin",
        nodeIds: ["co", "roles", "locs", "masters", "opscfg"],
      },
    ],
    nodes: [
      { id: "co", label: "Company profile" },
      { id: "roles", label: "Departments, roles & users" },
      { id: "locs", label: "Branches & warehouses" },
      { id: "masters", label: "Master data & dealers" },
      { id: "opscfg", label: "Planning, planogram & integrations" },
    ],
    edges: [
      { from: "co", to: "roles" },
      { from: "roles", to: "locs" },
      { from: "locs", to: "masters" },
      { from: "masters", to: "opscfg" },
    ],
  },
  {
    id: "plan",
    title: "Plan → suggested orders",
    tabLabel: "Plan",
    summary:
      "Supply Planning loads forecast data, reviews suggestions, and turns approved drafts into auto-replenish orders.",
    kind: "swimlane",
    lanes: [
      {
        id: "sp",
        role: "Supply Planning",
        nodeIds: ["import", "allocate", "review", "promote"],
      },
      {
        id: "tl",
        role: "Team Leader",
        nodeIds: ["tl_see"],
      },
    ],
    nodes: [
      { id: "import", label: "Import / refresh forecast" },
      { id: "allocate", label: "Allocate to branches" },
      { id: "review", label: "Review suggested orders" },
      { id: "promote", label: "Create auto-replenish drafts" },
      { id: "tl_see", label: "See drafts in Auto replenish" },
    ],
    edges: [
      { from: "import", to: "allocate" },
      { from: "allocate", to: "review" },
      { from: "review", to: "promote" },
      { from: "promote", to: "tl_see" },
    ],
  },
  {
    id: "orders",
    title: "Branch orders",
    tabLabel: "Orders",
    summary:
      "Approval path depends on order type. Logistics fulfills only after Supply Planning’s final approval.",
    kind: "swimlane",
    lanes: [
      {
        id: "ps",
        role: "Product Specialist",
        nodeIds: ["manual_create", "manual_ps"],
      },
      {
        id: "tl",
        role: "Team Leader",
        nodeIds: ["manual_tl", "auto_tl", "special_create"],
      },
      {
        id: "sp",
        role: "Supply Planning",
        nodeIds: ["manual_sp", "auto_sp", "special_sp"],
      },
      {
        id: "logistics",
        role: "Logistics",
        nodeIds: ["fulfill"],
      },
      {
        id: "branch",
        role: "Branch",
        nodeIds: ["accept"],
      },
    ],
    nodes: [
      { id: "manual_create", label: "Manual: create order" },
      { id: "manual_ps", label: "Manual: PS review" },
      { id: "manual_tl", label: "Manual: TL review" },
      { id: "manual_sp", label: "Manual: SP approval" },
      { id: "auto_tl", label: "Auto: TL review" },
      { id: "auto_sp", label: "Auto: SP approval" },
      { id: "special_create", label: "Special: TL creates" },
      { id: "special_sp", label: "Special: SP approval" },
      { id: "fulfill", label: "Schedule delivery" },
      { id: "accept", label: "Accept in Operations" },
    ],
    edges: [
      { from: "manual_create", to: "manual_ps" },
      { from: "manual_ps", to: "manual_tl" },
      { from: "manual_tl", to: "manual_sp" },
      { from: "manual_sp", to: "fulfill" },
      { from: "auto_tl", to: "auto_sp" },
      { from: "auto_sp", to: "fulfill" },
      { from: "special_create", to: "special_sp" },
      { from: "special_sp", to: "fulfill" },
      { from: "fulfill", to: "accept" },
    ],
    callouts: [
      "Manual: Product Specialist → Team Leader → Supply Planning.",
      "Auto replenish: Team Leader → Supply Planning.",
      "Special: Team Leader creates → Supply Planning.",
    ],
  },
  {
    id: "deliveries",
    title: "Deliveries & acceptance",
    tabLabel: "Deliveries",
    summary:
      "Logistics plans inbound shipments from approved orders; the branch confirms what arrived.",
    kind: "swimlane",
    lanes: [
      {
        id: "logistics",
        role: "Logistics",
        nodeIds: ["sched", "dispatch"],
      },
      {
        id: "branch",
        role: "Branch",
        nodeIds: ["receive", "resolve"],
      },
    ],
    nodes: [
      { id: "sched", label: "Create / update delivery" },
      { id: "dispatch", label: "Set schedule & notes" },
      { id: "receive", label: "Accept in Operations" },
      { id: "resolve", label: "Resolve shortage / damage" },
    ],
    edges: [
      { from: "sched", to: "dispatch" },
      { from: "dispatch", to: "receive" },
      { from: "receive", to: "resolve" },
    ],
    callouts: ["Units move In transit → On hand when the branch accepts."],
  },
  {
    id: "transfers",
    title: "Transfers",
    tabLabel: "Transfers",
    summary:
      "Requesting branch asks for stock; Team Leader approves; releasing branch sends units; requesting branch receives them on hand.",
    kind: "swimlane",
    lanes: [
      {
        id: "requesting",
        role: "Requesting branch",
        nodeIds: ["create_req", "receive_xfer"],
      },
      {
        id: "tl",
        role: "Team Leader",
        nodeIds: ["approve_xfer"],
      },
      {
        id: "releasing",
        role: "Releasing branch",
        nodeIds: ["release_xfer"],
      },
    ],
    nodes: [
      {
        id: "create_req",
        label: "Create transfer request",
        hint: "Syncs transfer request to SAP when connected",
      },
      { id: "approve_xfer", label: "Approve or cancel request" },
      {
        id: "release_xfer",
        label: "Mark For Transfer / release",
        hint: "Syncs transfer document to SAP when connected",
      },
      { id: "receive_xfer", label: "Receive stock → On hand" },
    ],
    edges: [
      { from: "create_req", to: "approve_xfer" },
      { from: "approve_xfer", to: "release_xfer" },
      { from: "release_xfer", to: "receive_xfer" },
    ],
    callouts: [
      "Who can create, approve, release, or receive depends on your role setup.",
      "SAP sync may be queued or pending depending on your tenant integration.",
    ],
  },
  {
    id: "pullouts",
    title: "Pull-outs",
    tabLabel: "Pull-outs",
    summary:
      "Bring stock back from a branch through logistics to the warehouse.",
    kind: "swimlane",
    lanes: [
      {
        id: "ps",
        role: "Product Specialist",
        nodeIds: ["request"],
      },
      {
        id: "tl",
        role: "Team Leader",
        nodeIds: ["approve"],
      },
      {
        id: "logistics",
        role: "Logistics",
        nodeIds: ["pickup"],
      },
      {
        id: "branch",
        role: "Branch",
        nodeIds: ["release_po"],
      },
      {
        id: "wh",
        role: "Warehouse",
        nodeIds: ["validate"],
      },
    ],
    nodes: [
      { id: "request", label: "Create pull-out" },
      { id: "approve", label: "Approve request" },
      { id: "pickup", label: "Schedule pickup" },
      { id: "release_po", label: "Release goods" },
      { id: "validate", label: "Validate receipt" },
    ],
    edges: [
      { from: "request", to: "approve" },
      { from: "approve", to: "pickup" },
      { from: "pickup", to: "release_po" },
      { from: "release_po", to: "validate" },
    ],
  },
  {
    id: "sales-atr",
    title: "Sales and returns",
    tabLabel: "Sales & returns",
    summary:
      "Encode the sale under Sales. Request a return from the sale details, then track evaluate → approve → restore under Returns / Replacement. Accounting can mark units Official Sold via Official Sales.",
    kind: "swimlane",
    lanes: [
      {
        id: "sales",
        role: "Sales / Branch",
        nodeIds: ["encode", "request_atr"],
      },
      {
        id: "cs",
        role: "Customer service",
        nodeIds: ["evaluate"],
      },
      {
        id: "tl",
        role: "Team Leader",
        nodeIds: ["tl_approve"],
      },
      {
        id: "inv",
        role: "Inventory",
        nodeIds: ["restore"],
      },
      {
        id: "accounting",
        role: "Accounting",
        nodeIds: ["make_ofs"],
      },
    ],
    nodes: [
      { id: "encode", label: "Encode sale" },
      { id: "request_atr", label: "Request return" },
      { id: "evaluate", label: "Evaluate request" },
      { id: "tl_approve", label: "Approve return" },
      { id: "restore", label: "Restore to on hand" },
      {
        id: "make_ofs",
        label: "Make Official Sold",
        hint: "Via Official Sales (Reports)",
      },
    ],
    edges: [
      { from: "encode", to: "request_atr" },
      { from: "request_atr", to: "evaluate" },
      { from: "evaluate", to: "tl_approve" },
      { from: "tl_approve", to: "restore" },
      { from: "encode", to: "make_ofs" },
    ],
    callouts: [
      "Sold (or reserved) units return to On hand after a successful restore.",
      "Who can request, evaluate, approve, or restore depends on your role setup.",
      "Official Sold is not a customer return — use Official Sales to mark sold; DEL there restores On hand without Returns / Replacement.",
      "After a sale, customer returns go through Returns / Replacement (Branch, Service, or Approvals).",
    ],
  },
  {
    id: "official-sales",
    title: "Official Sales",
    tabLabel: "Official Sales",
    summary:
      "Accounting uploads the dealer template, reviews staging rows, then processes Action Keys to mark Official Sold or restore On hand.",
    kind: "swimlane",
    lanes: [
      {
        id: "accounting",
        role: "Accounting",
        nodeIds: ["dl_template", "upload_stage", "process_keys"],
      },
    ],
    nodes: [
      { id: "dl_template", label: "Download template" },
      { id: "upload_stage", label: "Upload & review staging" },
      {
        id: "process_keys",
        label: "Process by Action Key",
        hint: "ADD · WHSE_ADD · DEL",
      },
    ],
    edges: [
      { from: "dl_template", to: "upload_stage" },
      { from: "upload_stage", to: "process_keys" },
    ],
    callouts: [
      "ADD and WHSE_ADD mark units Official Sold.",
      "DEL restores units to On hand (no return approval needed).",
      "UPD edits stay under Sales; pull-out holds block ADD until cleared.",
    ],
  },
  {
    id: "pcount",
    title: "P-Count (stock count)",
    tabLabel: "P-Count",
    summary: "Align physical shelf counts with system records and lock the session for audit.",
    kind: "swimlane",
    lanes: [
      {
        id: "branch",
        role: "Branch",
        nodeIds: ["session", "count"],
      },
      {
        id: "inv",
        role: "Inventory / approver",
        nodeIds: ["review", "finalize"],
      },
    ],
    nodes: [
      { id: "session", label: "Open count session" },
      { id: "count", label: "Enter counts & notes" },
      { id: "review", label: "Review variances" },
      { id: "finalize", label: "Finalize & close" },
    ],
    edges: [
      { from: "session", to: "count" },
      { from: "count", to: "review" },
      { from: "review", to: "finalize" },
    ],
    callouts: ["Closed sessions stay locked — start a new session for recounts."],
  },
  {
    id: "policies",
    title: "Policies",
    tabLabel: "Policies",
    summary: "Controlled documents from draft through publication for ISMS readers.",
    kind: "swimlane",
    lanes: [
      {
        id: "owner",
        role: "Policy owner",
        nodeIds: ["draft", "submit"],
      },
      {
        id: "approver",
        role: "Approver",
        nodeIds: ["review_pol", "publish"],
      },
      {
        id: "readers",
        role: "Readers",
        nodeIds: ["consume"],
      },
    ],
    nodes: [
      { id: "draft", label: "Create draft" },
      { id: "submit", label: "Submit for review" },
      { id: "review_pol", label: "Review / request changes" },
      { id: "publish", label: "Publish active version" },
      { id: "consume", label: "Read published policy" },
    ],
    edges: [
      { from: "draft", to: "submit" },
      { from: "submit", to: "review_pol" },
      { from: "review_pol", to: "publish" },
      { from: "publish", to: "consume" },
    ],
  },
  {
    id: "who-does-what",
    title: "Who does what",
    tabLabel: "Roles",
    summary: "Common roles and their day-to-day responsibilities.",
    kind: "matrix",
    lanes: [
      {
        id: "ps",
        role: "Product Specialist",
        nodeIds: ["ps_work"],
      },
      {
        id: "tl",
        role: "Team Leader",
        nodeIds: ["tl_work"],
      },
      {
        id: "sp",
        role: "Supply Planning",
        nodeIds: ["sp_work"],
      },
      {
        id: "logistics",
        role: "Logistics",
        nodeIds: ["log_work"],
      },
      {
        id: "branch",
        role: "Branch / Sales",
        nodeIds: ["br_work"],
      },
      {
        id: "accounting",
        role: "Accounting",
        nodeIds: ["acct_work"],
      },
      {
        id: "admin",
        role: "Tenant admin",
        nodeIds: ["ad_work"],
      },
    ],
    nodes: [
      {
        id: "ps_work",
        label: "Manual orders, pull-outs, competitors",
      },
      {
        id: "tl_work",
        label: "Endorse orders, specials, approve returns",
      },
      {
        id: "sp_work",
        label: "Final order approval, planning",
      },
      {
        id: "log_work",
        label: "Deliveries, transfers, pickups",
      },
      {
        id: "br_work",
        label: "Accept stock, sell, count, request returns",
      },
      {
        id: "acct_work",
        label: "Official Sales, sale header edits",
      },
      {
        id: "ad_work",
        label: "Users, roles, branches, settings",
      },
    ],
    edges: [],
  },
];

export const WORKFLOW_FLOWCHARTS: WorkflowChart[] = [
  WORKFLOW_MASTER_OVERVIEW,
  ...WORKFLOW_SWIMLANE_CHARTS,
];

export function getWorkflowChartById(id: string): WorkflowChart | undefined {
  return WORKFLOW_FLOWCHARTS.find((chart) => chart.id === id);
}
