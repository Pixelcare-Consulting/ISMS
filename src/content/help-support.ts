export type HelpQuickLinkGroup =
  | "daily"
  | "inventory"
  | "logistics"
  | "reports"
  | "admin";

export interface HelpQuickLink {
  id: string;
  title: string;
  description: string;
  href: string;
  group: HelpQuickLinkGroup;
}

export interface HelpWorkflowStep {
  label: string;
  description?: string;
}

export interface HelpWorkflowGuide {
  id: string;
  title: string;
  summary: string;
  audience: string;
  href: string;
  steps: HelpWorkflowStep[];
  tips?: string[];
}

export interface HelpFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface HelpFaqCategory {
  id: string;
  title: string;
  items: HelpFaqItem[];
}

export const HELP_QUICK_LINK_GROUP_LABELS: Record<HelpQuickLinkGroup, string> = {
  daily: "Daily work",
  inventory: "Inventory",
  logistics: "Logistics",
  reports: "Reports",
  admin: "Settings & admin",
};

/** Essential modules only — shown in the help sidebar quick actions. */
export const HELP_QUICK_LINKS: HelpQuickLink[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Start here for your daily overview.",
    href: "/dashboard",
    group: "daily",
  },
  {
    id: "orders",
    title: "Orders",
    description: "Create and approve branch orders.",
    href: "/orders",
    group: "daily",
  },
  {
    id: "returns",
    title: "Returns / Replacement",
    description: "Track and finish customer returns.",
    href: "/returns",
    group: "daily",
  },
  {
    id: "policies",
    title: "Policies",
    description: "ISMS documents and approvals.",
    href: "/policies",
    group: "daily",
  },
  {
    id: "inventory",
    title: "Stock units",
    description: "Look up serialized branch stock.",
    href: "/inventory",
    group: "inventory",
  },
  {
    id: "warehouse-stock",
    title: "Warehouse stock",
    description: "Browse serials held in warehouses.",
    href: "/inventory/warehouse-stock",
    group: "inventory",
  },
  {
    id: "stock-count",
    title: "Stock count",
    description: "Run physical count sessions.",
    href: "/inventory/stock-count",
    group: "inventory",
  },
  {
    id: "operations",
    title: "Operations",
    description: "Branch deliveries, transfers, pull-outs.",
    href: "/operations",
    group: "inventory",
  },
  {
    id: "deliveries",
    title: "Deliveries",
    description: "Logistics inbound scheduling.",
    href: "/logistics/deliveries",
    group: "logistics",
  },
  {
    id: "profile",
    title: "Profile settings",
    description: "Your account details.",
    href: "/settings/profile",
    group: "daily",
  },
];

export const HELP_WORKFLOW_GUIDES: HelpWorkflowGuide[] = [
  {
    id: "navigate-portal",
    title: "Navigate the ISMS portal",
    summary:
      "Learn how the header menu maps to daily work so you spend less time searching.",
    audience: "All users",
    href: "/dashboard",
    steps: [
      {
        label:
          "Sign in and land on Dashboard for a role-based snapshot of what needs attention.",
      },
      {
        label:
          "Use the top navigation: Policies, Inventory (dropdown), Orders, Logistics (dropdown), Sales, Returns / Replacement, Reports (dropdown), Settings (dropdown).",
      },
      {
        label:
          "Open your avatar menu for Profile Settings, Help & Support, and Sign out.",
      },
      {
        label:
          "If a module is missing, you likely lack permission—contact your tenant admin instead of using direct URLs.",
      },
    ],
    tips: [
      "Inventory and Logistics group related tasks—expand those menus first when stock is involved.",
      "Reports are read-only; operational changes always happen in Orders, Inventory, or Logistics.",
    ],
  },
  {
    id: "admin-setup",
    title: "Tenant admin essentials",
    summary: "Recommended setup order for new tenants or major onboarding.",
    audience: "Tenant admins",
    href: "/settings/company",
    steps: [
      { label: "Company settings: branding and tenant profile." },
      { label: "Departments, roles, and users: map staff to permissions." },
      { label: "Branches, warehouses, master data: locations and catalog." },
      { label: "Planning, planogram, and integrations: operational automation." },
    ],
    tips: [
      "Grant least privilege—users should only see modules required for their job.",
      "Test integrations in a non-peak window before enabling sync jobs.",
    ],
  },
  {
    id: "planning-suggested",
    title: "Planning & suggested orders",
    summary:
      "Supply Planning refreshes forecast data, reviews suggestions, and creates auto-replenish drafts for Team Leader review.",
    audience: "Supply Planning · Team Leader",
    href: "/planning/suggested-orders",
    steps: [
      { label: "Open Planning settings and import or refresh forecast data for the period." },
      { label: "Allocate demand to branches and review suggested quantities." },
      { label: "From Suggested orders, promote accepted lines into auto-replenish drafts." },
      {
        label:
          "Team Leader opens Auto replenish orders to review, then Supply Planning gives final approval.",
      },
    ],
    tips: [
      "Suggested orders feed the Auto replenish path (Team Leader → Supply Planning)—not Manual or Special.",
    ],
  },
  {
    id: "branch-orders",
    title: "Branch order approvals",
    summary:
      "Approval path depends on order type; logistics fulfills only after final Supply Planning approval.",
    audience: "PS · TL · SP · Logistics",
    href: "/orders",
    steps: [
      {
        label:
          "Open Orders and pick the type: Manual, Auto replenish, or Special (each has its own menu).",
      },
      {
        label:
          "Manual: create the order → Product Specialist review → Team Leader review → Supply Planning approval.",
      },
      {
        label:
          "Auto replenish: Team Leader review → Supply Planning approval (often started from Suggested orders).",
      },
      {
        label: "Special: Team Leader creates the request → Supply Planning approval.",
      },
      {
        label:
          "After Supply Planning approves, logistics schedules delivery; the branch accepts stock in Operations when it arrives (In transit → On hand).",
      },
    ],
    tips: [
      "Check order status badges to see who must act next before escalating.",
      "Use Processed orders report after fulfillment for audit trails.",
    ],
  },
  {
    id: "deliveries",
    title: "Delivery scheduling & acceptance",
    summary: "Logistics plans inbound movement; branches confirm receipt.",
    audience: "Logistics · Branch",
    href: "/logistics/deliveries",
    steps: [
      { label: "Logistics creates or updates delivery records tied to approved orders." },
      { label: "Assign schedule, carrier notes, and expected arrival windows." },
      { label: "Branch opens Operations to accept delivery and confirm quantities received." },
      { label: "Resolve shortages or damages before closing the delivery line." },
    ],
    tips: ["Accepted units move from In transit to On hand."],
  },
  {
    id: "transfers",
    title: "Inter-branch transfers",
    summary:
      "Requesting branch creates a transfer request; Team Leader approves; releasing branch sends units; requesting branch receives them on hand.",
    audience: "Requesting branch · Team Leader · Releasing branch",
    href: "/logistics/transfers",
    steps: [
      {
        label:
          "Requesting branch creates a transfer request (syncs to SAP as a transfer request when connected).",
      },
      {
        label:
          "Team Leader approves the request — or cancels it if it should not proceed.",
      },
      {
        label:
          "Releasing branch marks units For Transfer and releases them (syncs the transfer document to SAP when connected).",
      },
      {
        label:
          "Requesting branch receives stock in Operations; units move to On hand. Use the Transfers report to reconcile open moves.",
      },
    ],
    tips: [
      "Who can create, approve, release, or receive depends on your role setup.",
      "SAP sync may be queued or pending depending on your tenant integration.",
    ],
  },
  {
    id: "pullouts",
    title: "Pull-outs & pickups",
    summary:
      "Return or pull inventory from branch back through logistics to warehouse.",
    audience: "PS · TL · Logistics · Branch",
    href: "/logistics/pickups",
    steps: [
      { label: "Product Specialist creates the pull-out request with reason and items." },
      { label: "Team Leader reviews and approves." },
      { label: "Logistics schedules pickup and coordinates with branch." },
      { label: "Branch releases goods; warehouse validates receipt to close the loop." },
    ],
  },
  {
    id: "branch-operations",
    title: "Branch operations hub",
    summary:
      "Single place for branch staff to action deliveries, transfers, and pull-outs.",
    audience: "Branch staff",
    href: "/operations",
    steps: [
      { label: "Open Operations from the app (or Quick actions) each day." },
      { label: "Deliveries tab: accept inbound shipments against open delivery records." },
      { label: "Transfers tab: confirm send/receive steps for your branch." },
      { label: "Pull-outs tab: complete release steps when logistics schedules pickup." },
    ],
  },
  {
    id: "sales-entry",
    title: "Recording branch sales",
    summary: "Capture customer sales for reporting and stock impact.",
    audience: "Sales · Branch",
    href: "/sales",
    steps: [
      { label: "Open Sales and start a new transaction for the branch." },
      { label: "Add line items (serials or package sets per your tenant setup)." },
      { label: "Complete the sale; verify totals and proof before submit." },
      { label: "Review Sales report for period close and management reporting." },
    ],
    tips: [
      "Accounting marks units Official Sold later via Official Sales (Reports) — that step is separate from encoding the sale here.",
    ],
  },
  {
    id: "sales-atr",
    title: "Customer return after a sale",
    summary:
      "Submit Process Return from the sale, then evaluate, approve, and restore or complete a replacement under Returns / Replacement.",
    audience: "Sales · CS · TL · Inventory",
    href: "/returns",
    steps: [
      {
        label:
          "From Sales, open the completed sale’s View details and choose Request return to open Process Return.",
      },
      {
        label:
          "Choose document type, STK or DEF, problem descriptions, then Return or Replacement (Service Return adds service fields when needed).",
      },
      {
        label:
          "Track the request in Returns / Replacement (Branch, Service, or Approvals) and download ATR/ODRF when available.",
      },
      {
        label:
          "Customer service evaluates the request (accept to continue, or reject to stop).",
      },
      {
        label:
          "Team Leader approves; then restore stock (Return) or finish Same/New Invoice (Replacement).",
      },
    ],
    tips: [
      "Who can request, evaluate, approve, or complete depends on your role setup.",
      "Reserved (RSV) sales follow the same return path when returns are allowed.",
      "Official Sold is not a customer return — Accounting uses Official Sales to mark sold; DEL there restores On hand without this return path.",
    ],
  },
  {
    id: "official-sales",
    title: "Official Sales (Accounting)",
    summary:
      "Upload the dealer template, review staging, then process Action Keys to mark Official Sold or restore On hand.",
    audience: "Accounting",
    href: "/reports/official-sales",
    steps: [
      { label: "Open Reports → Official Sales and download the dealer template." },
      {
        label:
          "Fill Action Keys (ADD, WHSE_ADD, DEL, or UPD as needed), then upload and review the staging rows.",
      },
      {
        label:
          "Process the batch: ADD and WHSE_ADD mark units Official Sold; DEL restores On hand.",
      },
      {
        label:
          "Check process results for any failed serials; UPD edits stay under Sales when you need header or line corrections.",
      },
    ],
    tips: [
      "Pull-out holds can block ADD until the hold is cleared.",
      "Official Sales is separate from the customer return path in Returns / Replacement.",
    ],
  },
  {
    id: "stock-count",
    title: "P-Count (stock count) session",
    summary: "Structured cycle to align physical stock with system records.",
    audience: "Branch · Inventory",
    href: "/inventory/stock-count",
    steps: [
      { label: "Create a session for the branch and scope (location or category)." },
      { label: "Count units and enter quantities; flag discrepancies with notes." },
      { label: "Submit for review; approvers validate large variances." },
      { label: "Finalize accepted adjustments and close the session for audit lock." },
    ],
    tips: ["Do not reopen closed sessions—start a new session for recounts."],
  },
  {
    id: "policy-lifecycle",
    title: "Policy draft to publication",
    summary: "Controlled document lifecycle for ISMS compliance.",
    audience: "Policy owners · Approvers",
    href: "/policies",
    steps: [
      { label: "Create draft with title, scope, owner, and target effective date." },
      { label: "Attach supporting files if required by your process." },
      { label: "Submit for review; reviewers comment or request revisions." },
      { label: "Approver publishes; users consume the active version from Policies." },
    ],
  },
  {
    id: "reports-audit",
    title: "Using reports & audit log",
    summary: "When to use each report and how audit log supports investigations.",
    audience: "Managers · Admins",
    href: "/reports/processed-orders",
    steps: [
      {
        label:
          "Processed orders: fulfillment history after orders complete logistics.",
      },
      {
        label: "Daily stock: point-in-time inventory positions by branch.",
      },
      {
        label: "Transfers, Sales, and P-Count reports: movement, revenue, and count history.",
      },
      {
        label: "Audit log: filter by user, action, or module when troubleshooting changes.",
      },
    ],
  },
];

export const HELP_FAQ_CATEGORIES: HelpFaqCategory[] = [
  {
    id: "account-access",
    title: "Account & Access",
    items: [
      {
        id: "access-1",
        question: "I cannot access a module I need. What should I do?",
        answer:
          "Ask your tenant admin to verify role assignments and permissions for your account.",
      },
      {
        id: "access-2",
        question: "Can I update my own profile details?",
        answer:
          "Yes. Open Profile Settings and update your personal details. Some role changes are admin-only.",
      },
      {
        id: "access-3",
        question: "How do I reset my password?",
        answer:
          "Use the sign-in password reset flow. If your account is managed by your organization, contact your tenant admin.",
      },
      {
        id: "access-4",
        question: "Why does my session end automatically?",
        answer:
          "Sessions can expire for security reasons. Sign in again and retry your action.",
      },
      {
        id: "access-5",
        question: "Why is Operations not in my top menu?",
        answer:
          "Operations is opened from Help quick actions or direct URL (/operations). Request inventory.view from your admin if you need branch execution screens.",
      },
      {
        id: "access-6",
        question: "Why do Inventory and Logistics have dropdown menus?",
        answer:
          "They group related tasks: Stock units and Stock count under Inventory; Deliveries, Transfers, and Pull-outs under Logistics.",
      },
      {
        id: "access-7",
        question: "Where is Help & Support?",
        answer:
          "Open your avatar menu (top right) and choose Help & Support, or go to /help.",
      },
    ],
  },
  {
    id: "navigation",
    title: "Navigation & modules",
    items: [
      {
        id: "nav-1",
        question: "What is the difference between Orders and Operations?",
        answer:
          "Orders handles replenishment requests and approvals. Operations is where branch staff accept deliveries, transfers, and pull-outs after logistics plans movement.",
      },
      {
        id: "nav-2",
        question: "When should I use Stock units vs Warehouse stock vs Stock count?",
        answer:
          "Stock units is branch shelf stock. Warehouse stock is serials still in warehouses. Stock count (P-Count) is for scheduled physical counts and posting variances.",
      },
      {
        id: "nav-3",
        question: "Where do I configure branches and users?",
        answer:
          "Settings → Branches and Settings → Users (admin permissions required).",
      },
      {
        id: "nav-4",
        question: "Can I bookmark a module URL?",
        answer:
          "Yes, but you still need permission for that route. Unauthorized pages will block access even with a direct link.",
      },
    ],
  },
  {
    id: "orders",
    title: "Orders",
    items: [
      {
        id: "orders-1",
        question: "How do I know who must approve my order next?",
        answer:
          "The order status shows the current approval stage. Approval path depends on order type.",
      },
      {
        id: "orders-2",
        question: "Why is my manual order taking longer than auto-replenish?",
        answer:
          "Manual orders include an extra Product Specialist review before Team Leader and Supply Planning approval.",
      },
      {
        id: "orders-3",
        question: "When does logistics start processing an order?",
        answer:
          "After final approval, the order moves into logistics fulfillment and delivery scheduling.",
      },
      {
        id: "orders-4",
        question: "Can I edit an order after submission?",
        answer:
          "Submitted orders usually need to be revised through the approval workflow. Follow your tenant process for changes.",
      },
      {
        id: "orders-5",
        question: "What are auto-replenish, manual, and special orders?",
        answer:
          "Auto-replenish is system-suggested replenishment. Manual adds a Product Specialist review step. Special is initiated by the Team Leader for non-standard requests.",
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    items: [
      {
        id: "inventory-1",
        question: "How often should stock count sessions be run?",
        answer:
          "Follow your branch policy schedule. Regular sessions help catch discrepancies early.",
      },
      {
        id: "inventory-2",
        question: "What if counted quantity differs from system quantity?",
        answer:
          "Submit adjustment details in the session and complete the review process before finalizing.",
      },
      {
        id: "inventory-3",
        question: "Who can finalize a stock count session?",
        answer:
          "Finalization depends on assigned permissions in your tenant setup.",
      },
      {
        id: "inventory-4",
        question: "Can I reopen a closed stock count session?",
        answer:
          "Closed sessions are typically locked for audit integrity. Create a new session if needed.",
      },
    ],
  },
  {
    id: "logistics-policies",
    title: "Logistics & Policies",
    items: [
      {
        id: "logistics-1",
        question: "What is the pull-out process flow?",
        answer:
          "Product Specialist creates, Team Leader approves, logistics schedules, branch releases, and warehouse validates.",
      },
      {
        id: "logistics-2",
        question: "Where do I track pickup status?",
        answer:
          "Use Logistics → Pull-outs for central tracking, or Operations at the branch for your assigned tasks.",
      },
      {
        id: "logistics-3",
        question: "What is the difference between Transfers and Deliveries?",
        answer:
          "Deliveries are inbound shipments to a branch (often from approved orders). Transfers start with a requesting branch request, Team Leader approval, releasing branch send, then the requesting branch receives stock on hand.",
      },
      {
        id: "policy-1",
        question: "Who can approve policies?",
        answer:
          "Policy approval follows your tenant's configured authorization roles and review process.",
      },
      {
        id: "policy-2",
        question: "How do I request a policy update?",
        answer:
          "Create a draft update and route it through your standard policy review and approval steps.",
      },
    ],
  },
  {
    id: "sales-reports",
    title: "Sales & reports",
    items: [
      {
        id: "sales-1",
        question: "Where do I record a branch sale?",
        answer: "Open Sales from the top navigation and create a new transaction for your branch.",
      },
      {
        id: "sales-ofs",
        question:
          "What’s the difference between Sales, Returns / Replacement, and Official Sales?",
        answer:
          "Sales is where you encode branch sales. Returns / Replacement is where you track and approve customer returns (the request still starts from the sale). Official Sales is Accounting’s dealer-template path for Official Sold / DEL — not the same as a customer return.",
      },
      {
        id: "sales-2",
        question: "Which report shows completed orders?",
        answer: "Reports → Processed orders lists fulfillment history after orders complete logistics.",
      },
      {
        id: "sales-3",
        question: "How do I check stock levels for a specific date?",
        answer: "Use Reports → Daily stock for a point-in-time snapshot by branch.",
      },
      {
        id: "sales-4",
        question: "Who can view the audit log?",
        answer:
          "Users with reports.view (or equivalent) can open Audit Logs → System logs in the menu.",
      },
      {
        id: "sales-5",
        question: "Are reports editable?",
        answer:
          "No. Reports are read-only. Make changes in the operational module (Orders, Inventory, Logistics, Sales), then refresh the report.",
      },
    ],
  },
  {
    id: "sap-settings",
    title: "SAP & Settings",
    items: [
      {
        id: "sap-1",
        question: "Who can configure SAP integration settings?",
        answer:
          "Only tenant admins or users with the required settings permissions should manage SAP configuration.",
      },
      {
        id: "sap-2",
        question: "What should I do if SAP sync fails?",
        answer:
          "Capture the error details and contact your tenant admin or support contact for investigation.",
      },
      {
        id: "sap-3",
        question: "Can branch users change global integration credentials?",
        answer:
          "No. Credentials are controlled at tenant level for security and consistency.",
      },
      {
        id: "sap-4",
        question: "Where can I check if integration is connected?",
        answer:
          "Open SAP integration settings to review current connection state and configuration notes.",
      },
    ],
  },
];
