/**
 * Release history for in-app "What's New" and update logs.
 *
 * Maintenance (each release):
 * 1. Bump `version` in package.json (semver: major.minor.patch)
 * 2. Prepend a new entry below with matching version, date, and highlights
 * 3. Deploy — login footer and What's new dialog update automatically
 */

export type ReleaseChangeType = "feature" | "fix" | "improvement";

export interface ReleaseChange {
  type: ReleaseChangeType;
  description: string;
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  changes?: ReleaseChange[];
}

export const RELEASES: ReleaseNote[] = [
  {
    version: "0.9.6",
    date: "2026-06-01",
    title: "Planning tables — pagination and filters",
    highlights: [
      "Allocation gaps on Planning and Suggested orders paginate at 25 rows per page",
      "Filter gaps by branch or search by branch name / SKU",
      "Draft suggested orders table supports branch filter, search, and pagination",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Planning — server-side pagination and branch/SKU filters on allocation gaps table",
      },
      {
        type: "improvement",
        description:
          "Suggested orders — paginated draft orders and open gaps with independent filters",
      },
    ],
  },
  {
    version: "0.9.5",
    date: "2026-06-01",
    title: "Full planning pipeline (forecast → allocation → suggested orders)",
    highlights: [
      "Settings → Planning: branch revenue targets, run allocation, generate auto-replenish drafts",
      "Planogram import with prune; Series/SRP columns; STK/DIT stock breakdown and inventory cross-links",
      "Inventory planogram badges, off-planogram filter, and Western Makati-aligned demo seed",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Forecast schema — PlanningPeriod, BranchForecastTarget, BranchAllocation; gapQty from planogram max minus STK",
      },
      {
        type: "feature",
        description:
          "Suggested orders — draft auto_replenish BranchOrders from allocations; submit for TL → SP approval",
      },
      {
        type: "fix",
        description:
          "Planning page — serialize Prisma Decimal/Date fields before passing props to client components",
      },
    ],
  },
  {
    version: "0.9.4",
    date: "2026-06-01",
    title: "BRS planogram seed and order UX",
    highlights: [
      "Demo seed aligns Devant/Sonique SKUs and shelf targets with BRS Planogram CSV (Dealer 1)",
      "Fourth demo branch (Western Pasig) and CSV-driven branch planograms",
      "Order review/create dialogs show workflow hints and remaining shelf capacity",
    ],
    changes: [
      {
        type: "feature",
        description: "BRS seed — CSV parser for Dealer 1 planogram targets; Devant/Sonique brands, ~33 SKUs, 4 branches",
      },
      {
        type: "improvement",
        description: "Orders — Review dialog shows type, branch, lines, human status, and next approver",
      },
      {
        type: "improvement",
        description: "Orders — Create dialog shows remaining shelf capacity; auto-replenish marked coming soon",
      },
    ],
  },
  {
    version: "0.9.3",
    date: "2026-06-01",
    title: "Audit log readability",
    highlights: [
      "Operational audit entries show branch names, document numbers, and line summaries",
      "Colored entity badges for orders, deliveries, transfers, pull-outs, and sales",
    ],
    changes: [
      {
        type: "improvement",
        description: "Audit log — action-specific detail formatters for orders, logistics, and sales events",
      },
      {
        type: "improvement",
        description: "Audit writers — enrich metadata at log time with branch names, doc numbers, and routes",
      },
      {
        type: "fix",
        description: "Audit log — inventory.status_updated label now displays correctly",
      },
      {
        type: "improvement",
        description: "Orders and logistics lists — shared search toolbar, colored status badges, client-side search on logistics tables",
      },
      {
        type: "fix",
        description: "Navigation progress bar — no longer renders above header dropdown menus",
      },
    ],
  },
  {
    version: "0.9.2",
    date: "2026-06-01",
    title: "Navigation performance",
    highlights: [
      "Faster tab switching between Dashboard, Policies, Audit logs, and Settings",
      "Instant loading skeleton while pages fetch data",
      "Reduced duplicate auth and database queries on every navigation",
    ],
    changes: [
      { type: "fix", description: "Auth JWT — stop reloading permissions from the database on every page navigation" },
      { type: "improvement", description: "Request-scoped auth deduplication so layout, page, and server actions share one session check" },
      { type: "improvement", description: "Cached header branding/profile data and Prisma client reuse on Vercel warm instances" },
      { type: "improvement", description: "App-wide loading skeleton for smoother tab transitions" },
      { type: "improvement", description: "Unified list toolbar on Orders and logistics pages — search left, actions right, colored status and order-type badges" },
    ],
  },
  {
    version: "0.9.1",
    date: "2026-06-01",
    title: "Logistics UX polish",
    highlights: [
      "Cleaner status badges without redundant technical codes",
      "Color-coded action buttons for Accept vs TL approve",
      "Confirmation dialogs before delivery acceptance and transfer approval",
    ],
    changes: [
      { type: "improvement", description: "Status badges — show human-readable labels only in logistics and ops tables; inventory still shows DIT/STK codes" },
      { type: "improvement", description: "Logistics actions — emerald Accept and amber TL approve buttons for clearer intent" },
      { type: "improvement", description: "Confirm before Accept or TL approve on /logistics and /operations with delivery/transfer context" },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-06-01",
    title: "Planogram, MIL, and SKU governance (Sprint 9)",
    highlights: [
      "SP-managed branch planogram UI with shelf capacity and MIL thresholds",
      "SKU status governance (active / hold / retired) with audit trail",
      "Order enforcement: planogram-only SKUs with special-order exception",
      "Dashboard alerts for below-capacity and MIL aging breaches",
    ],
    changes: [
      { type: "feature", description: "Settings → Planogram — per-branch authorized SKUs, max qty, MIL days (SP manage, TL/PS/AE view)" },
      { type: "feature", description: "Master data models — edit SKU status with audit logging" },
      { type: "feature", description: "Orders — model picker filtered by branch planogram; max qty validation; special orders for off-planogram SKUs" },
      { type: "feature", description: "Dashboard KPIs — below planogram capacity and MIL threshold breach counts (AOR-scoped)" },
      { type: "improvement", description: "Expanded BRS demo seed with multi-model planogram and MIL scenarios" },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-06-01",
    title: "BRS hybrid inventory ops (Sprints 3–8 MVP)",
    highlights: [
      "Org structure: branches, warehouses, master data, and AOR-scoped users",
      "Serialized inventory, branch orders with PS→TL→SP→Logistics approvals",
      "Logistics MVP: delivery acceptance, transfers, pull-outs",
      "Sales stub with ATR status and role dashboards with pending KPIs",
    ],
    changes: [
      { type: "feature", description: "Settings → Branches, Master data, AORs with BRS role seeds (PS, TL, SP, Logistics, AE)" },
      { type: "feature", description: "/inventory — AOR-filtered serial list with audited status changes" },
      { type: "feature", description: "/orders — create and multi-step approval workflow with optional Resend notifications" },
      { type: "feature", description: "/logistics and /sales — MVP transaction screens" },
      { type: "feature", description: "Dashboard ops KPIs: pending approvals, DIT, stock, open ATR" },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-01",
    title: "Full policy document control",
    highlights: [
      "Read-only policy access for employees and auditors",
      "ISO-style version history and new revisions on approved policies",
      "Reviewer workflow with comments, email notifications, attachments, and PDF export",
    ],
    changes: [
      { type: "feature", description: "policies.view permission — browse approved policies without edit rights" },
      { type: "feature", description: "Version history and New revision — approved policies get a new draft version instead of in-place edits" },
      { type: "feature", description: "Review activity timeline with optional comments on submit, approve, and revert" },
      { type: "feature", description: "Resend email notifications to reviewers and authors (no-op when env unset)" },
      { type: "feature", description: "Supabase Storage attachments (PDF, DOCX, PNG) per policy version" },
      { type: "feature", description: "Export PDF for in-review and approved policies" },
    ],
  },
  {
    version: "0.1.4",
    date: "2026-06-01",
    title: "Sprint 1 completion & policies",
    highlights: [
      "Department CRUD under Settings with default departments on registration",
      "Paginated audit log viewer for compliance review",
      "Policy document control with draft → review → approved workflow",
    ],
    changes: [
      { type: "feature", description: "Settings → Departments — create, edit, and delete with user-count guard" },
      { type: "feature", description: "Settings → Audit log — filter by action and entity type with pagination" },
      { type: "feature", description: "Company branding changes write audit events (name, tagline, logo)" },
      { type: "feature", description: "Policies module — list, create, edit drafts, submit for review, approve" },
    ],
  },
  {
    version: "0.1.3",
    date: "2026-06-01",
    title: "Branding & UI polish",
    highlights: [
      "Tenant-scoped company logo upload in Company Settings",
      "What's new in the page header with improved release notes UI",
      "Add actions moved beside table search on Users, Roles, and Permissions",
    ],
    changes: [
      { type: "feature", description: "Company logo upload — JPEG, PNG, or WebP; shown in the sidebar for your tenant only" },
      { type: "feature", description: "company.manage permission for Tenant Admin; Super Admin can always edit branding" },
      { type: "improvement", description: "What's new button on every app page header (next to page actions)" },
      { type: "improvement", description: "Release notes — sticky footer pagination and color-coded Feature / Improvement / Fix badges" },
      { type: "improvement", description: "Add user, Add role, and Create permission buttons aligned to the right of table search bars" },
    ],
  },
  {
    version: "0.1.2",
    date: "2026-06-01",
    title: "Settings & permissions",
    highlights: [
      "Edit and delete users and roles with search on settings tables",
      "Global permissions catalog for platform operators",
      "Permission-gated sidebar navigation tied to app modules",
    ],
    changes: [
      { type: "feature", description: "Edit user dialog — name, email, role, and department" },
      { type: "feature", description: "Edit and delete roles with user-count badges and protected system roles" },
      { type: "feature", description: "Permissions settings page — create and manage the global permission catalog (Super Admin)" },
      { type: "feature", description: "App modules registry — permission slugs linked to routes and sidebar access" },
      { type: "improvement", description: "Search on Users and Roles tables" },
      { type: "improvement", description: "Sticky roles & permissions matrix with row actions" },
      { type: "improvement", description: "Reusable delete confirmation dialog for settings tables" },
      { type: "improvement", description: "User menu dropdown — profile settings and sign out" },
      { type: "improvement", description: "Profile photo upload and removal" },
      { type: "improvement", description: "What's new link on the login screen" },
      { type: "fix", description: "Platform-operator roles hidden from tenant role pickers and guarded from deletion" },
    ],
  },
  {
    version: "0.1.1",
    date: "2026-06-01",
    title: "What's new dialog",
    highlights: ["Added What's new dialog with paginated release notes"],
    changes: [
      { type: "feature", description: "What's new dialog on login and auth sidebar" },
      { type: "improvement", description: "Paginated release notes (one version per page)" },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06-01",
    title: "Initial release",
    highlights: [
      "Role-based authentication with tenant-scoped access",
      "User and role management for dealer organizations",
      "Operational dashboard shell and settings foundation",
    ],
    changes: [
      { type: "feature", description: "Email/password sign-in with Auth.js" },
      { type: "feature", description: "Tenant-scoped RBAC and permissions" },
      { type: "feature", description: "Settings: users, roles, and profile" },
    ],
  },
];
