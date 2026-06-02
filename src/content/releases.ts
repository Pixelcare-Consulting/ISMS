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
    version: "0.11.11",
    date: "2026-06-02",
    title: "Instant CRUD updates for remaining settings tables",
    highlights: [
      "Warehouses, status settings, and master-data create/update flows now reflect instantly in table UI",
      "Server revalidation and background refresh remain in place for consistency",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Settings UX — optimistic updates expanded to warehouse/location, status codes, and master-data entries",
      },
    ],
  },
  {
    version: "0.11.10",
    date: "2026-06-02",
    title: "Instant CRUD updates on more settings pages",
    highlights: [
      "Departments, branches, and AOR tables now update immediately after create, edit, and delete",
      "Background route refresh remains enabled to keep data synchronized with server state",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Settings CRUD UX — optimistic row updates extended beyond users table",
      },
    ],
  },
  {
    version: "0.11.9",
    date: "2026-06-02",
    title: "Faster user table CRUD feedback",
    highlights: [
      "Users table now updates immediately after create, edit, and delete actions",
      "Background route refresh still runs to keep server state fully synchronized",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Settings users — optimistic local row updates wired to CRUD dialog success callbacks",
      },
    ],
  },
  {
    version: "0.11.8",
    date: "2026-06-02",
    title: "Remove redundant section tabs",
    highlights: [
      "Inventory, Logistics, and Reports no longer show pill tabs when the same routes are in the top nav dropdown",
      "Master data and SAP integration keep in-page tabs (sub-routes not duplicated in header)",
    ],
    changes: [
      {
        type: "improvement",
        description: "SectionLayout — tabs optional; removed from layouts that mirror header nav groups",
      },
    ],
  },
  {
    version: "0.11.7",
    date: "2026-06-02",
    title: "AppDataTable and header pointer cursor",
    highlights: [
      "Reusable AppDataTable for consistent card-style tables across pages",
      "Planning branch revenue targets use the same table shell as allocation gaps",
      "Top navbar links and menus show pointer cursor on hover",
    ],
    changes: [
      {
        type: "feature",
        description: "components/data-table — AppDataTable + barrel export for shared table layout",
      },
      {
        type: "improvement",
        description: "Header nav, user menu, and dropdown items — cursor-pointer on hover",
      },
    ],
  },
  {
    version: "0.11.6",
    date: "2026-06-02",
    title: "Master data tables and Decimal fix",
    highlights: [
      "Models page no longer passes Prisma Decimal to client components",
      "Brands and models tables use shared DataTableShell styling",
      "Buttons show pointer cursor on hover app-wide",
    ],
    changes: [
      {
        type: "fix",
        description: "listModelsAction serializes srp/cbm to plain numbers before client props",
      },
      {
        type: "improvement",
        description: "Master data brands/models tables — card shell, headers, SRP column on models",
      },
      {
        type: "improvement",
        description: "Button component — cursor-pointer on interactive states",
      },
    ],
  },
  {
    version: "0.11.5",
    date: "2026-06-02",
    title: "Clearer tabs and secondary buttons",
    highlights: [
      "Active section tabs use primary teal fill for obvious selection",
      "Outline and secondary buttons have visible borders and background so actions read as clickable",
    ],
    changes: [
      {
        type: "improvement",
        description: "RouteTabs — active pill uses primary color; inactive tabs show hover affordance",
      },
      {
        type: "improvement",
        description: "Button outline/secondary variants — stronger border, shadow, and hover states app-wide",
      },
    ],
  },
  {
    version: "0.11.4",
    date: "2026-06-02",
    title: "Reusable section tabs across app",
    highlights: [
      "Pill-style RouteTabs + SectionLayout for SAP integration, Logistics, Reports, Master data, and Inventory",
      "Tab labels and routes centralized in src/config/section-tabs.ts",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Navigation — RouteTabs (pill | underline) and SectionLayout; SectionPageLead for per-tab copy",
      },
      {
        type: "improvement",
        description:
          "Layouts — logistics, reports, master-data, inventory sections use shared tab chrome",
      },
    ],
  },
  {
    version: "0.11.3",
    date: "2026-06-02",
    title: "Encrypt all SAP Service Layer credentials at rest",
    highlights: [
      "Service Layer URL, company DB, username, and password are all AES-256-GCM encrypted in the database",
      "Audit logs record SHA-256 fingerprints only — no plaintext credentials in metadata",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "SAP Service Layer — encrypt baseUrl, companyDb, username, and password columns; legacy plaintext rows re-encrypt on save",
      },
    ],
  },
  {
    version: "0.11.2",
    date: "2026-06-02",
    title: "SAP Service Layer settings",
    highlights: [
      "Settings → SAP integration → Service Layer submenu to configure B1 Service Layer URL, company DB, and credentials",
      "Per-tenant config stored encrypted in sap_service_layer_configs; integration queue unchanged",
    ],
    changes: [
      {
        type: "feature",
        description:
          "SAP — Service Layer setup form at /settings/sap-integration/service-layer with encrypted password storage",
      },
      {
        type: "improvement",
        description:
          "SAP integration — tab submenu (Integration queue | Service Layer)",
      },
    ],
  },
  {
    version: "0.11.1",
    date: "2026-06-02",
    title: "Out-of-delivery auto-reschedule at SP approve",
    highlights: [
      "SP delivery due date uses branch deliverySchedule — past or off-window dates auto-reschedule to the next scheduled day",
      "Review dialog warns before approve; audit log records requested vs final due date",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Orders — resolveDeliveryDueDate on SP final approve (Process A out-of-delivery window)",
      },
      {
        type: "improvement",
        description:
          "Docs — README v1.0 traceability updated for shipped Phase 2–3 items",
      },
    ],
  },
  {
    version: "0.11.0",
    date: "2026-06-02",
    title: "Physical stock count and SAP integration foundation",
    highlights: [
      "Physical inventory audit: count sessions from branch STK, PS scan, variance report, TL investigation, SAP adjustment handoff",
      "SAP epic foundation: outbound queue with idempotency, sapDocRef on orders/deliveries/pull-outs, mock order→SAP→delivery processor",
      "Routes at /inventory/stock-count and /settings/sap-integration with full audit trail",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Stock count — StockCountSession/Line/Variance models; workflow CSV steps 37–41",
      },
      {
        type: "feature",
        description:
          "SAP — SapIntegrationJob queue, emitApprovedOrder/emitPulloutItr/emitSalesSummary/syncInventoryFromSap stubs",
      },
      {
        type: "feature",
        description:
          "Orders — SP approval enqueues SAP job; mock processor sets sapDocRef and creates delivery",
      },
      {
        type: "improvement",
        description:
          "Docs — docs/sap-integration.md updated with implemented vs stub matrix",
      },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-06-02",
    title: "Sales SN flow, logistics movement, ATR workflow, warehouses",
    highlights: [
      "Sales SN picker (AOR-scoped STK), reserved RSV sales, and /reports/sales CSV export",
      "Transfer and pull-out serial lines move inventory on execute/receive and pull-out lifecycle",
      "BranchReturnRequest workflow — CS evaluate, TL approve, inventory restore",
      "Settings → Warehouses admin for warehouse and location setup (CSV step 4)",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Sales — SN picker, reserved sale (RSV), ATR return workflow with BranchReturnRequest",
      },
      {
        type: "feature",
        description:
          "Reports — /reports/sales CSV with transaction, serial, ATR, and return status",
      },
      {
        type: "feature",
        description:
          "Logistics — transfer lines, pull-out SN status transitions, optional per-SN delivery accept",
      },
      {
        type: "feature",
        description: "Settings — /settings/warehouses CRUD for warehouses and locations",
      },
    ],
  },
  {
    version: "0.9.8",
    date: "2026-06-02",
    title: "Process flow quick wins and v1.0 doc traceability",
    highlights: [
      "Planning: visible Upload forecast CSV button on settings planning panel",
      "Logistics: reject pending deliveries (delivery_workflow.rejected) on deliveries and operations",
      "Orders: SP delivery due date warning; auto-replenish links to suggested orders",
      "Docs: PROCESS FLOW v1.0 (A–D) table, SAP pull-out/sales/returns scope, fixed roadmap plan links",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Planning — Upload forecast CSV button wires hidden file input on /settings/planning",
      },
      {
        type: "feature",
        description:
          "Logistics — rejectDeliveryAction and Reject UI on /logistics/deliveries and /operations",
      },
      {
        type: "improvement",
        description:
          "Orders — delivery due date out-of-window warning at SP approve; suggested-orders link in create dialog",
      },
      {
        type: "improvement",
        description:
          "Docs — v1.0 PDF indexed; A–D traceability and gap table in docs/README.md; sap-integration.md extended",
      },
    ],
  },
  {
    version: "0.9.7",
    date: "2026-06-01",
    title: "Processed orders report, SO# format, and xlsx workflow gaps",
    highlights: [
      "Processed Order Summary CSV export with approved qty, SPA remarks, CBM, and geography",
      "Sales order numbers use SO#{YYYY}-{MM}-#####; SP approval sets processedAt and line approvedQty",
      "Daily stock and transfer CSV reports; SPA/supply planning roles; SAP MVP documented",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Reports — /reports/processed-orders, /reports/daily-stock, /reports/transfers CSV exports",
      },
      {
        type: "feature",
        description:
          "Orders — SO# monthly sequencer, approvedQty per line, spaRemarks, deliveryDueDate, brand on header",
      },
      {
        type: "improvement",
        description:
          "RBAC — supply_planning, supply_planning_associate, and spa roles; xlsx-aligned workflow status codes",
      },
      {
        type: "improvement",
        description:
          "Docs — traceability tables in docs/README.md; SAP integration MVP in docs/sap-integration.md",
      },
    ],
  },
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
